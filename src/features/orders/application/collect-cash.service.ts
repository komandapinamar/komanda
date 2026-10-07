import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { cashRegisterMovements, cashShifts, tenantOrders } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import {
  collectCashSchema,
  type CollectCashResponse,
} from "@/features/orders/domain/collect-cash.schemas";
import {
  ForbiddenRoleError,
  InvalidPickupPinError,
  NoOpenCashShiftError,
  OrderConflictError,
  OrderNotFoundError,
} from "@/features/orders/application/order-errors";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { PrintJobService } from "@/features/printing/application/print-job.service";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import type { TenantContext } from "@/lib/tenant-context/types";

export { ForbiddenRoleError };

export class CollectCashService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async collect(input: {
    context: TenantContext;
    orderId: string;
    idempotencyKey: string;
    body: unknown;
  }): Promise<CollectCashResponse> {
    const request = collectCashSchema.parse(input.body);
    const { context, orderId, idempotencyKey } = input;

    if (
      context.actor.kind !== "user" ||
      !["owner", "admin", "employee"].includes(context.actor.role)
    ) {
      throw new ForbiddenRoleError(
        "El operador no cuenta con un rol autorizado para cobrar en efectivo.",
      );
    }

    return withTenantTransaction(context, async (transaction) => {
      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: context.tenantId,
        scope: `collect-cash:${orderId}`,
        key: idempotencyKey,
        request,
        retentionSeconds: 60 * 60,
      });

      if (claim.replayed) {
        return claim.body as CollectCashResponse;
      }

      // 1. Fetch current order
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

      // 2. Idempotency for already paid orders (before any eligibility guard,
      //    so a late retry after TTL still reports the settled state)
      if (order.paymentStatus === "paid") {
        const paidAtIso = order.updatedAt
          ? new Date(order.updatedAt).toISOString()
          : this.now().toISOString();
        const response: CollectCashResponse = {
          orderId: order.id,
          purchaseNumber: String(order.purchaseNumber),
          paymentStatus: "paid",
          paidAt: paidAtIso,
          version: order.version,
        };
        await idempotency.complete(claim.recordId, 200, response);
        return response;
      }

      // 3. Validate current status
      if (order.fulfillmentStatus === "cancelled") {
        throw new OrderConflictError("Order is already cancelled.");
      }

      if (order.paymentStatus === "refunded") {
        throw new OrderConflictError("Order has already been refunded.");
      }

      if (order.tender !== "cash") {
        throw new OrderConflictError(
          "Solo se permite cobrar en efectivo órdenes con método de pago en efectivo.",
        );
      }

      if (
        order.paymentExpiresAt &&
        new Date(order.paymentExpiresAt).getTime() <= this.now().getTime()
      ) {
        throw new OrderConflictError(
          "El tiempo límite para abonar este pedido en caja ha expirado.",
        );
      }

      // 4. Validate open cash shift strictly at the order's location
      const shiftConditions = [
        eq(cashShifts.tenantId, context.tenantId),
        eq(cashShifts.status, "open"),
      ];
      if (order.locationId) {
        shiftConditions.push(eq(cashShifts.locationId, order.locationId));
      }

      const [openShift] = await transaction
        .select()
        .from(cashShifts)
        .where(and(...shiftConditions))
        .limit(1);

      if (!openShift) {
        throw new NoOpenCashShiftError(
          "No existe un turno de caja abierto en la sucursal de la orden para registrar el cobro.",
        );
      }

      // 5. Authenticate payment collection (AD-6)
      if (request.authMethod === "pickup_pin") {
        if (!order.pickupPin || request.authCode !== order.pickupPin) {
          throw new InvalidPickupPinError(
            "El código PIN de retiro es inválido.",
          );
        }
      } else if (request.authMethod === "account_auth") {
        if (context.actor.kind !== "user" || !context.actor.userId) {
          throw new ForbiddenRoleError(
            "Se requiere una sesión de usuario válida para autorizar el cobro.",
          );
        }
      }

      const now = this.now();

      // 6. Atomically transition order to paid with optimistic concurrency lock
      const [updatedOrder] = await transaction
        .update(tenantOrders)
        .set({
          paymentStatus: "paid",
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

      // 7. Insert sale_deposit into cash_register_movements (AD-4)
      await transaction.insert(cashRegisterMovements).values({
        tenantId: context.tenantId,
        locationId: order.locationId,
        shiftId: openShift.id,
        orderId: order.id,
        type: "sale_deposit",
        amount: order.total,
        occurredAt: now,
        recordedByUserId:
          context.actor.kind === "user" ? context.actor.userId : null,
        idempotencyKey: `cash_deposit:${order.id}`,
      });

      // 8. Enqueue kitchen print jobs and dispatch outbox/audit events
      const orderRepo = new OrderRepository(transaction, context);
      const hydrated = await orderRepo.findById(order.id);
      if (hydrated) {
        await new PrintJobService().enqueueOrderTicketInTransaction(
          transaction,
          context,
          hydrated,
        );
      }

      await orderRepo.appendTransitionEvent({
        orderId: order.id,
        fromStatus: order.fulfillmentStatus,
        toStatus: order.fulfillmentStatus,
      });

      await appendAuditEvent(transaction, context, {
        action: "order.collect_cash",
        resourceType: "order",
        resourceId: order.id,
        outcome: "allowed",
        metadata: {
          purchaseNumber: String(order.purchaseNumber),
          total: order.total,
          authMethod: request.authMethod,
          shiftId: openShift.id,
        },
      });

      await appendOutboxEvent(transaction, context, {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "order.paid",
        payload: {
          orderId: order.id,
          source: order.source,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentStatus: "paid",
          purchaseNumber: String(order.purchaseNumber),
        },
      });

      await appendOutboxEvent(transaction, context, {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "print.intent.created",
        payload: {
          orderId: order.id,
          source: order.source,
          paymentStatus: "paid",
        },
      });

      const response: CollectCashResponse = {
        orderId: updatedOrder.id,
        purchaseNumber: String(updatedOrder.purchaseNumber),
        paymentStatus: "paid",
        paidAt: now.toISOString(),
        version: updatedOrder.version,
      };

      await idempotency.complete(claim.recordId, 200, response);

      return response;
    });
  }
}
