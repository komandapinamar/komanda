import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { cashRegisterMovements, cashShifts, tenantOrders } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import {
  refundCashSchema,
  type RefundCashResponse,
} from "@/features/orders/domain/refund-cash.schemas";
import {
  ForbiddenRoleError,
  OrderConflictError,
  OrderNotFoundError,
} from "@/features/orders/application/order-errors";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import type { TenantContext } from "@/lib/tenant-context/types";

export { ForbiddenRoleError };

export class RefundCashService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async refund(input: {
    context: TenantContext;
    orderId: string;
    idempotencyKey: string;
    body: unknown;
  }): Promise<RefundCashResponse> {
    const request = refundCashSchema.parse(input.body);
    const { context, orderId, idempotencyKey } = input;

    if (
      context.actor.kind !== "user" ||
      !["owner", "admin", "employee"].includes(context.actor.role)
    ) {
      throw new ForbiddenRoleError(
        "El operador no cuenta con un rol autorizado para registrar devoluciones.",
      );
    }

    return withTenantTransaction(context, async (transaction) => {
      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: context.tenantId,
        scope: `refund-cash:${orderId}`,
        key: idempotencyKey,
        request,
        retentionSeconds: 60 * 60,
      });

      if (claim.replayed) {
        return claim.body as RefundCashResponse;
      }

      const [order] = await transaction
        .select()
        .from(tenantOrders)
        .where(
          and(
            eq(tenantOrders.tenantId, context.tenantId),
            eq(tenantOrders.id, orderId),
          ),
        )
        .limit(1);

      if (!order) {
        throw new OrderNotFoundError("Order not found.");
      }

      if (order.paymentStatus === "refunded") {
        const refundedAt = order.updatedAt
          ? new Date(order.updatedAt).toISOString()
          : this.now().toISOString();
        const [existingMovement] = await transaction
          .select({ id: cashRegisterMovements.id })
          .from(cashRegisterMovements)
          .where(
            and(
              eq(cashRegisterMovements.tenantId, context.tenantId),
              eq(cashRegisterMovements.orderId, order.id),
              eq(cashRegisterMovements.type, "cancellation_withdrawal"),
            ),
          )
          .limit(1);
        const response: RefundCashResponse = {
          orderId: order.id,
          paymentStatus: "refunded",
          fulfillmentStatus: "cancelled",
          refundedAt,
          cashMovementId: existingMovement?.id ?? null,
          version: order.version,
        };
        await idempotency.complete(claim.recordId, 200, response);
        return response;
      }

      if (order.fulfillmentStatus === "cancelled") {
        throw new OrderConflictError("Order is already cancelled.");
      }

      if (order.fulfillmentStatus === "delivered") {
        throw new OrderConflictError(
          "No se puede reembolsar un pedido que ya fue entregado.",
        );
      }

      if (order.tender !== "cash") {
        throw new OrderConflictError(
          "Solo se permite devolver órdenes cobradas en efectivo.",
        );
      }

      if (order.paymentStatus !== "paid") {
        throw new OrderConflictError(
          "Solo se pueden devolver órdenes cobradas (pagadas).",
        );
      }

      // Associate a shift only when one is open at the order's location.
      const [openShift] = await transaction
        .select()
        .from(cashShifts)
        .where(and(
          eq(cashShifts.tenantId, context.tenantId),
          eq(cashShifts.status, "open"),
          eq(cashShifts.locationId, order.locationId),
        ))
        .limit(1);

      const now = this.now();

      const [updatedOrder] = await transaction
        .update(tenantOrders)
        .set({
          paymentStatus: "refunded",
          fulfillmentStatus: "cancelled",
          version: sql`${tenantOrders.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(tenantOrders.tenantId, context.tenantId),
            eq(tenantOrders.id, order.id),
            eq(tenantOrders.version, order.version),
          ),
        )
        .returning();

      if (!updatedOrder) {
        throw new OrderConflictError("Order version is stale.");
      }

      const [movement] = await transaction
        .insert(cashRegisterMovements)
        .values({
          tenantId: context.tenantId,
          locationId: order.locationId,
          shiftId: openShift?.id ?? null,
          orderId: order.id,
          type: "cancellation_withdrawal",
          amount: order.total,
          occurredAt: now,
          recordedByUserId:
            context.actor.kind === "user" ? context.actor.userId : null,
          reason: request.reason,
          idempotencyKey: `cash_refund:${order.id}`,
        })
        .returning({ id: cashRegisterMovements.id });

      if (order.discountSnapshot) {
        const discountRepo = new DiscountRepository(
          transaction,
          context.tenantId,
        );
        await discountRepo.markRedemptionCancelled(order.id);
      }

      const repository = new OrderRepository(transaction, context);
      await repository.appendTransitionEvent({
        orderId: order.id,
        fromStatus: order.fulfillmentStatus,
        toStatus: "cancelled",
      });

      await appendAuditEvent(transaction, context, {
        action: "order.refund_cash",
        resourceType: "order",
        resourceId: order.id,
        outcome: "allowed",
        metadata: {
          purchaseNumber: String(order.purchaseNumber),
          total: order.total,
          reason: request.reason,
          operatorNote: request.operatorNote,
          shiftId: openShift?.id ?? null,
        },
      });

      await appendOutboxEvent(transaction, context, {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "order.refunded",
        payload: {
          orderId: order.id,
          source: order.source,
          fulfillmentStatus: "cancelled",
          paymentStatus: "refunded",
          purchaseNumber: String(order.purchaseNumber),
          reason: request.reason,
          refundedAt: now.toISOString(),
        },
      });

      const response: RefundCashResponse = {
        orderId: updatedOrder.id,
        paymentStatus: "refunded",
        fulfillmentStatus: "cancelled",
        refundedAt: now.toISOString(),
        cashMovementId: movement?.id ?? null,
        version: updatedOrder.version,
      };

      await idempotency.complete(claim.recordId, 200, response);

      return response;
    });
  }
}
