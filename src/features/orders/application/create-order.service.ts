import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { tenants, tenantLocations, tenantSettings, cashRegisterMovements } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import { centsToMoney, moneyToCents, revalidateCartSelection } from "@/features/cart/domain/cart.rules";
import { OrderConflictError, OrderNotFoundError } from "./order-errors";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { PrintJobService } from "@/features/printing/application/print-job.service";
import { BillingRepository } from "@/features/billing/infrastructure/billing.repository";
import { SlackAlertService } from "@/features/integrations/application/slack-alert.service";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import { calculateDiscountAmounts } from "@/features/discounts/domain/discount.rules";

const customerSchema = z
  .object({
    name: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() !== ""
            ? value.trim()
            : "NN",
        z.string().trim().min(1).default("NN"),
      ),
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

export const createDirectOrderSchemaFromItems = z
  .object({
    items: z.array(directOrderItemSchema).min(1).max(100),
    customer: customerSchema.optional().default({ name: "NN" }),
    tender: z.enum(["cash", "posnet"]).default("cash"),
    paymentStatus: z
      .enum(["paid", "pending", "verification_required"])
      .default("paid"),
    notes: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? undefined : value,
        z.string().trim().max(1000).optional(),
      ),
    discountCode: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? undefined : value,
        z.string().trim().max(50).optional(),
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
        paymentStatus: "paid",
        tender: "cash",
        customer: request.customer,
        notes: request.notes,
        idempotencyKey,
        paymentAttemptId: null,
        approvedAt: new Date(),
      });

      if (created) {
        if (typeof (transaction as { insert?: unknown }).insert === "function") {
          await transaction.insert(cashRegisterMovements).values({
            tenantId: context.tenantId,
            locationId: order.locationId,
            orderId: order.id,
            type: "sale_deposit",
            amount: order.total,
            occurredAt: new Date(),
            recordedByUserId:
              context.actor.kind === "user" ? context.actor.userId : null,
            idempotencyKey: `cash_deposit:${order.id}`,
          });
        }
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
      const categoryMap = new Map<string, string | null>();
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
        categoryMap.set(selection.resourceId, (catalog as { categoryId?: string | null }).categoryId ?? null);
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

      let initialDiscountTotal = "0.00";
      let initialTotalCents = subtotalCents;
      let appliedDiscountCodeId: string | null = null;
      let discountMetadata: {
        code: string;
        name: string;
        discountType: string;
        discountValue: string;
        savingsAmount: string;
      } | null = null;

      if (request.discountCode) {
        const discountRepo = new DiscountRepository(transaction, context.tenantId);
        const discount = await discountRepo.findByCode(request.discountCode);
        if (discount) {
          const linesForDiscount = lines.map((line, index) => ({
            id: `line-${index}`,
            resourceId: line.resourceId,
            categoryId: categoryMap.get(line.resourceId) ?? undefined,
            quantity: line.quantity,
            unitPriceCents: moneyToCents(line.unitPrice),
            lineTotalCents: moneyToCents(line.lineTotal),
          }));

          const calcResult = calculateDiscountAmounts({
            lines: linesForDiscount,
            coupon: discount,
            now: new Date(),
          });

          if (calcResult.isEligible) {
            initialDiscountTotal = calcResult.discountTotal;
            initialTotalCents = calcResult.totalCents;
            appliedDiscountCodeId = discount.id;
            discountMetadata = {
              code: discount.code,
              name: discount.name,
              discountType: discount.discountType,
              discountValue: discount.discountValue,
              savingsAmount: calcResult.discountTotal,
            };
          } else {
            throw new OrderConflictError("El código de descuento no es aplicable a este pedido.");
          }
        } else {
          throw new OrderConflictError("Código de descuento inválido o no encontrado.");
        }
      }

      const cart = await cartRepo.create({
        locationId: location.id,
        currency: tenantRow.currency,
        subtotal: centsToMoney(subtotalCents),
        discountTotal: initialDiscountTotal,
        total: centsToMoney(initialTotalCents),
        appliedDiscountCodeId,
        discountMetadata,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        lines,
      });
      if (!cart) throw new Error("Failed to create cart.");

      const resolvedCustomer = {
        ...request.customer,
        name: request.customer?.name?.trim() || "NN",
      };

      const { order, created } = await orderRepo.createFromCartSnapshot({
        cart,
        source: "admin_direct",
        paymentStatus: request.paymentStatus,
        tender: request.tender,
        customer: resolvedCustomer as Record<string, unknown>,
        notes: request.notes,
        idempotencyKey,
        paymentAttemptId: null,
        approvedAt: new Date(),
      });

      if (created) {
        if (request.tender === "cash" && request.paymentStatus === "paid") {
          await transaction.insert(cashRegisterMovements).values({
            tenantId: context.tenantId,
            locationId: order.locationId,
            orderId: order.id,
            type: "sale_deposit",
            amount: order.total,
            occurredAt: new Date(),
            recordedByUserId:
              context.actor.kind === "user" ? context.actor.userId : null,
            idempotencyKey: `cash_deposit:${order.id}`,
          });
        }
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
        if (request.paymentStatus === "paid") {
          await new BillingRepository(transaction, context.tenantId).issueDocument({
            orderId: order.id,
            locationId: order.locationId,
            customerName: typeof order.customer === "object" && order.customer && "name" in order.customer
              ? String(order.customer.name)
              : undefined,
          });
        }

        if (request.tender === "cash") {
          const [settings] = await transaction
            .select({ webhook: tenantSettings.slackCashAlertWebhookUrl })
            .from(tenantSettings)
            .where(eq(tenantSettings.tenantId, context.tenantId))
            .limit(1);

          if (settings?.webhook) {
            void new SlackAlertService().dispatchCashOrderAlert({
              webhookUrl: settings.webhook,
              ticketNumber: order.purchaseNumber,
              total: order.total,
              currency: order.currency,
              items: lines.map((l) => ({
                name: l.name,
                quantity: l.quantity,
                lineTotal: l.lineTotal,
              })),
            });
          }
        }
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
