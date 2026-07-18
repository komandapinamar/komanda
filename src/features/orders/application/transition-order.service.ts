import { z } from "zod";
import { withTenantTransaction } from "@/db/tenant-transaction";
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
      assertFulfillmentTransition(current.fulfillmentStatus, nextStatus);

      if (current.fulfillmentStatus === nextStatus) {
        return current;
      }

      const updated = await repository.transition({
        orderId: input.orderId,
        expectedVersion: input.expectedVersion,
        nextStatus,
      });
      if (!updated) {
        throw new OrderConflictError("Order version is stale.");
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
          version: order.version,
        },
      });
      return order;
    });
  }
}
