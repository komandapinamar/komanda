import { withTenantTransaction } from "@/db/tenant-transaction";
import {
  visibleOrderStatuses,
  type FulfillmentStatus,
} from "@/features/orders/domain/order.rules";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import type { TenantContext } from "@/lib/tenant-context/types";
import { OrderNotFoundError, OrderValidationError } from "./order-errors";

export class OrderQueryService {
  async list(input: {
    context: TenantContext;
    status?: string | null;
    cursor?: string | null;
  }) {
    const status = input.status ? parseStatus(input.status) : undefined;
    if (input.cursor && Number.isNaN(new Date(input.cursor).getTime())) {
      throw new OrderValidationError("Invalid cursor.");
    }
    return withTenantTransaction(input.context, (transaction) =>
      new OrderRepository(transaction, input.context).list({
        status,
        cursor: input.cursor,
      }),
    );
  }

  async get(context: TenantContext, orderId: string) {
    return withTenantTransaction(context, async (transaction) => {
      const order = await new OrderRepository(transaction, context).findById(orderId);
      if (!order) throw new OrderNotFoundError("Order not found.");
      return order;
    });
  }

  async eventsAfter(input: { context: TenantContext; lastEventId?: string | null }) {
    const sequence = parseSequence(input.lastEventId);
    return withTenantTransaction(input.context, (transaction) =>
      new OrderRepository(transaction, input.context).listEventsAfter(sequence),
    );
  }
}

function parseStatus(value: string): FulfillmentStatus {
  const allowed = visibleOrderStatuses();
  if (!allowed.includes(value as FulfillmentStatus)) {
    throw new OrderValidationError("Invalid order status.");
  }
  return value as FulfillmentStatus;
}

function parseSequence(value: string | null | undefined) {
  if (!value) return BigInt(0);
  if (!/^\d+$/.test(value)) {
    throw new OrderValidationError("Invalid event cursor.");
  }
  return BigInt(value);
}
