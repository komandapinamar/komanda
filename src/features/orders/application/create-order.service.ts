import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { tenants, tenantLocations } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import { centsToMoney, revalidateCartSelection } from "@/features/cart/domain/cart.rules";
import { OrderConflictError, OrderNotFoundError } from "./order-errors";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { PrintJobService } from "@/features/printing/application/print-job.service";
import { BillingRepository } from "@/features/billing/infrastructure/billing.repository";

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

const directOrderItemSchema = z
  .object({
    kind: z.enum(["item", "combo"]),
    resourceId: z.string().uuid(),
    quantity: z.number().int().positive().max(50),
    optionIds: z.array(z.string().uuid()).max(50).default([]),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const createDirectOrderSchemaFromItems = z
  .object({
    items: z.array(directOrderItemSchema).min(1).max(100),
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
        await new BillingRepository(transaction, context.tenantId).issueDocument({
          orderId: order.id,
          locationId: order.locationId,
          documentType: "ticket_interno",
          customerDocType: "CF",
          customerName: typeof order.customer === "object" && order.customer && "name" in order.customer
            ? String(order.customer.name)
            : undefined,
        });
      }

      return order;
    });
  }

  async createDirectFromItems(
    context: TenantContext,
    value: unknown,
    idempotencyKey: string,
  ) {
    const request = createDirectOrderSchemaFromItems.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const [tenantRow] = await transaction
        .select({ currency: tenants.defaultCurrency })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);
      if (!tenantRow) throw new OrderNotFoundError("Tenant not found.");
      const [location] = await transaction
        .select({ id: tenantLocations.id })
        .from(tenantLocations)
        .where(
          and(
            eq(tenantLocations.tenantId, context.tenantId),
            eq(tenantLocations.isPrimary, true),
            eq(tenantLocations.status, "active"),
          ),
        )
        .limit(1);
      if (!location) throw new OrderNotFoundError("Primary location not found.");

      const cartRepo = new CartRepository(transaction, context.tenantId);
      const orderRepo = new OrderRepository(transaction, context);

      let subtotalCents = 0;
      const lines: Array<{
        kind: "item" | "combo";
        resourceId: string;
        quantity: number;
        name: string;
        unitPrice: string;
        lineTotal: string;
        imageUrl: string | null;
        note?: string;
        options: Array<{
          groupId: string;
          optionId: string;
          name: string;
          priceDelta: string;
        }>;
      }> = [];

      for (const selection of request.items) {
        const catalog = await cartRepo.loadSelection(selection.kind, selection.resourceId);
        if (!catalog || catalog.currency !== tenantRow.currency) {
          throw new OrderConflictError(
            `Product ${selection.resourceId} is unavailable.`,
          );
        }
        const validated = revalidateCartSelection(selection, catalog);
        const lineTotalCents = validated.unitPriceCents * selection.quantity;
        subtotalCents += lineTotalCents;
        lines.push({
          kind: selection.kind,
          resourceId: selection.resourceId,
          quantity: selection.quantity,
          name: catalog.name,
          unitPrice: centsToMoney(validated.unitPriceCents),
          lineTotal: centsToMoney(lineTotalCents),
          imageUrl: catalog.imageUrl,
          note: selection.note,
          options: validated.options,
        });
      }

      const cart = await cartRepo.create({
        locationId: location.id,
        currency: tenantRow.currency,
        subtotal: centsToMoney(subtotalCents),
        total: centsToMoney(subtotalCents),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        lines,
      });
      if (!cart) throw new Error("Failed to create cart.");

      const { order, created } = await orderRepo.createFromCartSnapshot({
        cart,
        source: "admin_direct",
        paymentStatus: "pending",
        customer: request.customer as Record<string, unknown>,
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
        await new BillingRepository(transaction, context.tenantId).issueDocument({
          orderId: order.id,
          locationId: order.locationId,
          documentType: "ticket_interno",
          customerDocType: "CF",
          customerName: typeof order.customer === "object" && order.customer && "name" in order.customer
            ? String(order.customer.name)
            : undefined,
        });
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
        await new BillingRepository(transaction, context.tenantId).issueDocument({
          orderId: order.id,
          locationId: order.locationId,
          documentType: "ticket_interno",
          customerDocType: "CF",
          customerName: typeof order.customer === "object" && order.customer && "name" in order.customer
            ? String(order.customer.name)
            : undefined,
        });
      }

      return order;
    });
  }
}
