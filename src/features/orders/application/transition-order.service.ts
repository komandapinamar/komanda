import { z } from "zod";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { cashRegisterMovements } from "@/db/schema";
import {
  assertFulfillmentTransition,
  type FulfillmentStatus,
} from "@/features/orders/domain/order.rules";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import { OrderConflictError, OrderNotFoundError } from "./order-errors";

export const transitionOrderSchema = z
  .object({
    fulfillmentStatus: z.enum(["preparing", "ready", "delivered", "cancelled"]),
  })
  .strict();

export class TransitionOrderService {
  async transition(input: {
    context: TenantContext;
    orderId: string;
    expectedVersion: number;
    body: unknown;
  }) {
    const request = transitionOrderSchema.parse(input.body);
    return withTenantTransaction(input.context, async (transaction) => {
      const repository = new OrderRepository(transaction, input.context);
      const current = await repository.findById(input.orderId);
      if (!current) {
        throw new OrderNotFoundError("Order not found.");
      }

      const nextStatus = request.fulfillmentStatus as FulfillmentStatus;
      assertFulfillmentTransition(
        current.fulfillmentStatus,
        nextStatus,
        current.source,
      );

      if (current.fulfillmentStatus === nextStatus) {
        return current;
      }

      const isManualCash =
        current.source === "admin_direct" &&
        current.tender === "cash" &&
        current.paymentStatus === "paid";
      const shouldRefundCash = nextStatus === "cancelled" && isManualCash;

      const updated = await repository.transition({
        orderId: input.orderId,
        expectedVersion: input.expectedVersion,
        nextStatus,
        paymentStatus: shouldRefundCash ? "refunded" : undefined,
      });
      if (!updated) {
        throw new OrderConflictError("Order version is stale.");
      }

      if (shouldRefundCash) {
        try {
          await transaction.insert(cashRegisterMovements).values({
            tenantId: input.context.tenantId,
            locationId: current.locationId,
            orderId: current.id,
            type: "cancellation_withdrawal",
            amount: current.total,
            occurredAt: new Date(),
            recordedByUserId:
              input.context.actor.kind === "user"
                ? input.context.actor.userId
                : null,
            idempotencyKey: `cash_withdrawal:${current.id}`,
          });
        } catch (error: unknown) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code: string }).code === "23505"
          ) {
            throw new OrderConflictError(
              "Cancellation withdrawal already recorded for this order.",
            );
          }
          throw error;
        }
      }

      await repository.appendTransitionEvent({
        orderId: input.orderId,
        fromStatus: current.fulfillmentStatus,
        toStatus: nextStatus,
      });
      const order = await repository.findById(input.orderId);
      if (!order) {
        throw new OrderNotFoundError("Order not found.");
      }
      await appendAuditEvent(transaction, input.context, {
        action: "order.transition",
        resourceType: "order",
        resourceId: order.id,
        outcome: "allowed",
        metadata: {
          fromStatus: current.fulfillmentStatus,
          toStatus: nextStatus,
        },
      });
      await appendOutboxEvent(transaction, input.context, {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "order.transitioned",
        payload: {
          orderId: order.id,
          fromStatus: current.fulfillmentStatus,
          toStatus: nextStatus,
          paymentStatus: order.paymentStatus,
          version: order.version,
        },
      });
      return order;
    });
  }
}
