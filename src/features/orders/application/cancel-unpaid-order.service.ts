import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { tenantOrders } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import {
  cancelUnpaidOrderSchema,
  type CancelUnpaidOrderResponse,
} from "@/features/orders/domain/cancel-unpaid-order.schemas";
import {
  InvalidPickupPinError,
  OrderAlreadyPaidError,
  OrderConflictError,
  OrderNotFoundError,
} from "@/features/orders/application/order-errors";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CancelUnpaidOrderService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async cancel(input: {
    tenantId: string;
    orderId: string;
    body: unknown;
    correlationId?: string;
  }): Promise<CancelUnpaidOrderResponse> {
    const request = cancelUnpaidOrderSchema.parse(input.body);

    if (!uuidPattern.test(input.tenantId) || !uuidPattern.test(input.orderId)) {
      throw new OrderNotFoundError("Order not found.");
    }

    const correlationId = input.correlationId ?? randomUUID();
    const context = createVerifiedTenantContext({
      tenantId: input.tenantId,
      correlationId,
      source: "public",
      actor: { kind: "anonymous", tenantSlug: "" },
    });

    return withTenantTransaction(context, async (transaction) => {
      const [order] = await transaction
        .select()
        .from(tenantOrders)
        .where(
          and(
            eq(tenantOrders.tenantId, input.tenantId),
            eq(tenantOrders.id, input.orderId),
          ),
        )
        .limit(1);

      if (!order) {
        throw new OrderNotFoundError("Order not found.");
      }

      // Idempotency check before PIN verification so the endpoint cannot be
      // used as a PIN-validation oracle after the order is already settled.
      if (order.fulfillmentStatus === "cancelled") {
        return {
          orderId: order.id,
          fulfillmentStatus: "cancelled",
          paymentStatus: order.paymentStatus ?? "pending",
          cancelledAt: order.updatedAt
            ? new Date(order.updatedAt).toISOString()
            : this.now().toISOString(),
        };
      }

      if (!order.pickupPin || order.pickupPin !== request.pickupPin) {
        throw new InvalidPickupPinError("El código PIN de retiro es inválido.");
      }

      // If already marked as paid, voluntary cancellation is rejected with 409
      if (order.paymentStatus === "paid") {
        throw new OrderAlreadyPaidError(
          "La orden ya ha sido abonada y no puede ser cancelada.",
        );
      }

      if (order.fulfillmentStatus === "delivered") {
        throw new OrderConflictError(
          "No se puede cancelar un pedido entregado.",
        );
      }

      // Voluntary cancellation is strictly allowed for pending cash orders
      if (order.paymentStatus !== "pending" || order.tender !== "cash") {
        throw new OrderConflictError(
          "Solo se permite cancelar pedidos en efectivo pendientes de pago.",
        );
      }

      const cancelledAt = this.now();
      const [updated] = await transaction
        .update(tenantOrders)
        .set({
          fulfillmentStatus: "cancelled",
          version: sql`${tenantOrders.version} + 1`,
          updatedAt: cancelledAt,
        })
        .where(
          and(
            eq(tenantOrders.tenantId, input.tenantId),
            eq(tenantOrders.id, order.id),
            eq(tenantOrders.version, order.version),
          ),
        )
        .returning();

      if (!updated) {
        throw new OrderConflictError("Order version is stale.");
      }

      if (order.discountSnapshot) {
        const discountRepo = new DiscountRepository(
          transaction,
          input.tenantId,
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
        action: "order.transition",
        resourceType: "order",
        resourceId: order.id,
        outcome: "allowed",
        metadata: {
          fromStatus: order.fulfillmentStatus,
          toStatus: "cancelled",
          reason: "unpaid_cash_cancelled",
        },
      });

      await appendOutboxEvent(transaction, context, {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "order.transitioned",
        payload: {
          orderId: order.id,
          fromStatus: order.fulfillmentStatus,
          toStatus: "cancelled",
          paymentStatus: order.paymentStatus,
          version: updated.version,
          reason: "unpaid_cash_cancelled",
        },
      });

      return {
        orderId: updated.id,
        fulfillmentStatus: "cancelled",
        paymentStatus: updated.paymentStatus ?? "pending",
        cancelledAt: cancelledAt.toISOString(),
      };
    });
  }
}
