import { withTenantTransaction } from "@/db/tenant-transaction";
import {
  validPaymentStatuses,
  visibleOrderStatuses,
  type FulfillmentStatus,
  type PaymentStatus,
} from "@/features/orders/domain/order.rules";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import type { TenantContext } from "@/lib/tenant-context/types";
import { OrderNotFoundError, OrderValidationError } from "./order-errors";

export class OrderQueryService {
  async list(input: {
    context: TenantContext;
    status?: string | null;
    cursor?: string | null;
    scope?: string | null;
    paymentStatus?: string | null;
    limit?: number;
  }) {
    const status = input.status ? parseStatus(input.status) : undefined;
    const scope = parseScope(input.scope);
    const paymentStatus = parsePaymentStatus(input.paymentStatus);
    if (input.cursor && Number.isNaN(new Date(input.cursor).getTime())) {
      throw new OrderValidationError("Invalid cursor.");
    }
    return withTenantTransaction(input.context, (transaction) =>
      new OrderRepository(transaction, input.context).list({
        status,
        scope,
        paymentStatus,
        cursor: input.cursor,
        limit: input.limit,
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

  async eventsHead(input: { context: TenantContext }) {
    return withTenantTransaction(input.context, (transaction) =>
      new OrderRepository(transaction, input.context).currentEventSequence(),
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

function parseScope(value: string | null | undefined): "kitchen" | "all" | undefined {
  if (!value) return undefined;
  if (value !== "kitchen" && value !== "all") {
    throw new OrderValidationError("Invalid scope.");
  }
  return value;
}

function parsePaymentStatus(value: string | null | undefined): PaymentStatus | undefined {
  if (!value) return undefined;
  const allowed = validPaymentStatuses();
  if (!allowed.includes(value as PaymentStatus)) {
    throw new OrderValidationError("Invalid payment status.");
  }
  return value as PaymentStatus;
}

function parseSequence(value: string | null | undefined) {
  if (!value) return BigInt(0);
  if (!/^\d+$/.test(value)) {
    throw new OrderValidationError("Invalid event cursor.");
  }
  return BigInt(value);
}
