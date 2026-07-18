import { z } from "zod";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import { OrderConflictError, OrderNotFoundError } from "./order-errors";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { PrintJobService } from "@/features/printing/application/print-job.service";

const customerSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? undefined : value,
        z.string().trim().email().optional(),
      ),
    phone: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? undefined : value,
        z.string().trim().optional(),
      ),
  })
  .strict();

export const createDirectOrderSchema = z
  .object({
    cartId: z.string().uuid(),
    customer: customerSchema,
    notes: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? undefined : value,
        z.string().trim().max(1000).optional(),
      ),
  })
  .strict();

export class CreateOrderService {
  async createDirect(
    context: TenantContext,
    value: unknown,
    idempotencyKey: string,
  ) {
    const request = createDirectOrderSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new OrderRepository(transaction, context);
      const cart = await repository.loadCart(request.cartId);
      if (!cart || cart.status === "expired") {
        throw new OrderNotFoundError("Cart not found.");
      }
      if (cart.status === "converted" || cart.lines.length === 0) {
        throw new OrderConflictError("Cart cannot be converted to an order.");
      }

      const { order, created } = await repository.createFromCartSnapshot({
        cart,
        source: "admin_direct",
        paymentStatus: "pending",
        customer: request.customer,
        notes: request.notes,
        idempotencyKey,
        paymentAttemptId: null,
        approvedAt: new Date(),
      });

      if (created) {
        await appendAuditEvent(transaction, context, {
          action: "order.create_direct",
          resourceType: "order",
          resourceId: order.id,
          outcome: "allowed",
          metadata: { cartId: cart.id, purchaseNumber: order.purchaseNumber },
        });
        await appendOutboxEvent(transaction, context, {
          aggregateType: "order",
          aggregateId: order.id,
          eventType: "order.created",
          payload: {
            orderId: order.id,
            source: order.source,
            fulfillmentStatus: order.fulfillmentStatus,
            paymentStatus: order.paymentStatus,
          },
        });
        await appendOutboxEvent(transaction, context, {
          aggregateType: "order",
          aggregateId: order.id,
          eventType: "print.intent.created",
          payload: {
            orderId: order.id,
            source: order.source,
            paymentStatus: order.paymentStatus,
          },
        });
        await new PrintJobService().enqueueOrderTicketInTransaction(
          transaction,
          context,
          order,
        );
      }

      return order;
    });
  }

  async createPaidFromPaymentAttempt(input: {
    context: TenantContext;
    paymentAttemptId: string;
    approvedAt?: Date | null;
  }) {
    const { context } = input;
    return withTenantTransaction(context, async (transaction) => {
      const repository = new OrderRepository(transaction, context);
      const attempt = await repository.loadPaymentAttempt(input.paymentAttemptId);
      if (!attempt) {
        throw new OrderNotFoundError("Payment attempt not found.");
      }
      if (attempt.status !== "approved") {
        throw new OrderConflictError("Payment attempt is not approved.");
      }
      const cart = await repository.loadCart(attempt.cartId);
      if (!cart) {
        throw new OrderNotFoundError("Cart not found.");
      }

      const { order, created } = await repository.createFromCartSnapshot({
        cart,
        source: "mercadopago_webhook",
        paymentStatus: "paid",
        customer: attempt.customerSnapshot,
        notes: attempt.notes ?? undefined,
        idempotencyKey: `payment-attempt:${attempt.id}`,
        paymentAttemptId: attempt.id,
        approvedAt: input.approvedAt ?? attempt.processedAt ?? new Date(),
      });

      if (created) {
        await appendAuditEvent(transaction, context, {
          action: "order.create_paid",
          resourceType: "order",
          resourceId: order.id,
          outcome: "allowed",
          metadata: {
            cartId: cart.id,
            paymentAttemptId: attempt.id,
            purchaseNumber: order.purchaseNumber,
          },
        });
        await appendOutboxEvent(transaction, context, {
          aggregateType: "order",
          aggregateId: order.id,
          eventType: "order.created",
          payload: {
            orderId: order.id,
            source: order.source,
            paymentAttemptId: attempt.id,
            fulfillmentStatus: order.fulfillmentStatus,
            paymentStatus: order.paymentStatus,
          },
        });
        await appendOutboxEvent(transaction, context, {
          aggregateType: "order",
          aggregateId: order.id,
          eventType: "print.intent.created",
          payload: {
            orderId: order.id,
            source: order.source,
            paymentStatus: order.paymentStatus,
          },
        });
        await new PrintJobService().enqueueOrderTicketInTransaction(
          transaction,
          context,
          order,
        );
      }

      return order;
    });
  }
}
