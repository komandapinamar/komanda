import "server-only";

import { and, eq } from "drizzle-orm";
import { withPlatformServiceTransaction, withTenantTransaction } from "@/db/tenant-transaction";
import { mpFinancialRecords, tenantOrders } from "@/db/schema";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import {
  IntegrationRepository,
  WebhookRoutingRepository,
} from "@/features/payments/infrastructure/integration.repository";
import { PrintJobService } from "@/features/printing/application/print-job.service";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export type ReceivedMercadoPagoWebhook = {
  providerEventId: string;
  resourceId: string;
  topic: string;
  action: string | null;
};

export class MercadoPagoWebhookRoutingError extends Error {}
export class MercadoPagoWebhookProviderError extends Error {}

export type MercadoPagoPaymentFeeDetail = {
  type: string;
  amount: number | string;
  fee_payer?: string;
};

export type MercadoPagoPaymentTax = {
  type: string;
  amount: number | string;
};

export type MercadoPagoPayment = {
  id: string | number;
  status?: string;
  preference_id?: string | null;
  metadata?: Record<string, unknown> | null;
  date_approved?: string | null;
  transaction_amount?: number | string;
  transaction_details?: {
    net_received_amount?: number | string;
    total_paid_amount?: number | string;
  };
  fee_details?: Array<MercadoPagoPaymentFeeDetail>;
  taxes_amount?: number | string;
  taxes?: Array<MercadoPagoPaymentTax>;
  charges_details?: Array<{
    type?: string;
    amounts?: { original?: number | string };
    name?: string;
  }>;
  money_release_date?: string | null;
  money_release_status?: "pending" | "released" | string | null;
  date_released?: string | null;
};

export type MercadoPagoPaymentLookup = {
  getPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPayment>;
};

export class MercadoPagoTenantPaymentClient implements MercadoPagoPaymentLookup {
  constructor(private readonly timeoutMs = 5_000) {}

  async getPayment(accessToken: string, paymentId: string) {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );
    if (response.status === 403 || response.status === 404) {
      throw new MercadoPagoWebhookRoutingError("Payment is not owned by this seller.");
    }
    if (!response.ok) {
      throw new MercadoPagoWebhookProviderError("Payment lookup failed.");
    }
    const payment = (await response.json()) as MercadoPagoPayment;
    if (!payment.id) throw new MercadoPagoWebhookProviderError("Invalid payment response.");
    return payment;
  }
}

function paymentStatus(status: string | undefined) {
  switch (status) {
    case "approved": return "approved" as const;
    case "rejected":
    case "cancelled": return "rejected" as const;
    case "pending":
    case "in_process":
    case "authorized": return "pending" as const;
    default: return "failed" as const;
  }
}

function priority(status: string) {
  if (status === "approved") return 4;
  if (status === "pending" || status === "processing") return 3;
  if (status === "initiated") return 2;
  return 1;
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function processedAt(payment: MercadoPagoPayment, status: string) {
  return status === "approved"
    ? payment.date_approved
      ? new Date(payment.date_approved)
      : new Date()
    : null;
}

export async function receiveMercadoPagoWebhook(input: {
  routingKey: string;
  event: ReceivedMercadoPagoWebhook;
  payload: Record<string, unknown>;
  correlationId: string;
  paymentClient?: MercadoPagoPaymentLookup;
}) {
  const { account, tokens } = await withPlatformServiceTransaction(
    { serviceId: "mercadopago:webhook-router", correlationId: input.correlationId },
    async (transaction) => {
      const account = await new WebhookRoutingRepository(transaction).resolveAccount(input.routingKey);
      if (!account) return { account: null, tokens: null };
      return {
        account,
        tokens: new IntegrationRepository(transaction, account.tenantId).decryptTokens(account),
      };
    },
  );

  if (!account || !tokens) throw new MercadoPagoWebhookRoutingError("Webhook route not found.");
  const payment = await (input.paymentClient ?? new MercadoPagoTenantPaymentClient()).getPayment(
    tokens.accessToken,
    input.event.resourceId,
  );
  const providerPaymentId = String(payment.id);
  const status = paymentStatus(payment.status);
  const preferenceId = payment.preference_id ?? metadataString(payment.metadata, "preferenceId");
  const context = createVerifiedTenantContext({
    tenantId: account.tenantId,
    correlationId: input.correlationId,
    source: "webhook",
    actor: { kind: "service", serviceId: "mercadopago:webhook" },
  });

  return withTenantTransaction(context, async (transaction) => {
    const routing = new WebhookRoutingRepository(transaction);
    const paymentRoute = await routing.findRoute({
      tenantId: account.tenantId,
      integrationAccountId: account.id,
      resourceType: "payment",
      externalId: providerPaymentId,
    });
    const preferenceRoute = preferenceId
      ? await routing.findRoute({
          tenantId: account.tenantId,
          integrationAccountId: account.id,
          resourceType: "preference",
          externalId: preferenceId,
        })
      : null;
    const attemptId = paymentRoute?.localResourceId ?? preferenceRoute?.localResourceId ?? metadataString(payment.metadata, "paymentAttemptId");
    const attempt = attemptId
      ? await routing.findPaymentAttempt({
          tenantId: account.tenantId,
          integrationAccountId: account.id,
          attemptId,
        })
      : null;
    const event = await routing.persistEvent({
      tenantId: account.tenantId,
      providerEventId: input.event.providerEventId,
      topic: input.event.topic,
      correlationId: input.correlationId,
      status: attempt ? "processed" : "ignored",
      payload: { ...input.payload, resourceId: providerPaymentId, routed: Boolean(attempt) },
    });
    if (!event) return { tenantId: account.tenantId, duplicate: true, routed: Boolean(attempt), paymentAttemptId: attempt?.id ?? null, webhookEventId: null };
    if (!attempt) return { tenantId: account.tenantId, duplicate: false, routed: false, paymentAttemptId: null, webhookEventId: event.id };

    const outOfOrder = priority(status) < priority(attempt.status);
    if (!outOfOrder) {
      await routing.attachPaymentResource({ tenantId: account.tenantId, integrationAccountId: account.id, paymentAttemptId: attempt.id, providerPaymentId });
      const updated = await routing.updatePaymentAttemptFromWebhook({
        tenantId: account.tenantId,
        integrationAccountId: account.id,
        paymentAttemptId: attempt.id,
        providerPaymentId,
        status,
        processedAt: processedAt(payment, status),
        failureCode: status === "failed" ? "provider_status" : null,
      });
      await appendOutboxEvent(transaction, context, {
        aggregateType: "payment_attempt",
        aggregateId: attempt.id,
        eventType: "mercadopago.payment.updated",
        payload: { providerEventId: input.event.providerEventId, status },
      });
      if (status === "approved" && updated) {
        const orders = new OrderRepository(transaction, context);
        let targetOrder: { id: string; locationId: string } | null = null;
        const cart = await orders.loadCart(updated.cartId);
        if (cart && cart.status !== "converted") {
          const result = await orders.createFromCartSnapshot({
            cart,
            source: "mercadopago_webhook",
            paymentStatus: "paid",
            customer: updated.customerSnapshot,
            notes: updated.notes ?? undefined,
            idempotencyKey: `payment-attempt:${updated.id}`,
            paymentAttemptId: updated.id,
            approvedAt: updated.processedAt ?? new Date(),
          });
          if (result.order) {
            targetOrder = { id: result.order.id, locationId: result.order.locationId };
          }
          if (result.created) {
            await appendAuditEvent(transaction, context, {
              action: "order.create_paid",
              resourceType: "order",
              resourceId: result.order.id,
              outcome: "allowed",
              metadata: { paymentAttemptId: updated.id, providerEventId: input.event.providerEventId },
            });
            await appendOutboxEvent(transaction, context, {
              aggregateType: "order",
              aggregateId: result.order.id,
              eventType: "order.created",
              payload: { orderId: result.order.id, paymentAttemptId: updated.id },
            });
            try {
              await new PrintJobService().enqueueOrderTicketInTransaction(transaction, context, result.order);
            } catch (printError) {
              console.warn("[webhook] Failed to enqueue print job:", printError);
            }
          }
        } else {
          const [existing] = await transaction
            .select({ id: tenantOrders.id, locationId: tenantOrders.locationId })
            .from(tenantOrders)
            .where(
              and(
                eq(tenantOrders.tenantId, account.tenantId),
                eq(tenantOrders.paymentAttemptId, updated.id),
              ),
            )
            .limit(1);
          if (existing) {
            targetOrder = existing;
          }
        }

        if (targetOrder) {
          const rawFeeDetails = Array.isArray(payment.fee_details) ? payment.fee_details : [];
          const feeDetails = rawFeeDetails.map((f) => ({
            type: String(f.type || "mercadopago_fee"),
            amount: Number(f.amount || 0).toFixed(2),
            feePayer: String(f.fee_payer || "collector"),
          }));

          const rawTaxesDetails = Array.isArray(payment.taxes) ? payment.taxes : [];
          const taxesDetails = rawTaxesDetails.map((t) => ({
            type: String(t.type || "tax"),
            amount: Number(t.amount || 0).toFixed(2),
          }));

          const grossNum = payment.transaction_amount != null
            ? Number(payment.transaction_amount)
            : Number(attempt.amount);
          const grossAmount = grossNum.toFixed(2);

          const feeNum = feeDetails.length > 0
            ? feeDetails.reduce((sum, f) => sum + Number(f.amount), 0)
            : (payment.transaction_details?.net_received_amount != null
                ? Math.max(0, grossNum - Number(payment.transaction_details.net_received_amount) - Number(payment.taxes_amount || 0))
                : 0);
          const feeAmount = feeNum.toFixed(2);

          const taxesNum = payment.taxes_amount != null
            ? Number(payment.taxes_amount)
            : (taxesDetails.length > 0 ? taxesDetails.reduce((sum, t) => sum + Number(t.amount), 0) : 0);
          const taxesAmount = taxesNum.toFixed(2);

          const netNum = payment.transaction_details?.net_received_amount != null
            ? Number(payment.transaction_details.net_received_amount)
            : (grossNum - feeNum - taxesNum);
          const netReceivedAmount = netNum.toFixed(2);

          const isFeeInclusiveOfTax = Boolean(
            taxesNum === 0 && feeNum > 0 && taxesDetails.length === 0,
          );

          const moneyReleaseStatus = payment.money_release_status === "released" ? "released" : "pending";
          const moneyReleaseExpectedAt = payment.money_release_date ? new Date(payment.money_release_date) : null;
          const moneyReleasedAt = payment.date_released
            ? new Date(payment.date_released)
            : (moneyReleaseStatus === "released" ? new Date() : null);
          const settlementDate = payment.date_approved ? new Date(payment.date_approved) : new Date();

          await transaction
            .insert(mpFinancialRecords)
            .values({
              tenantId: account.tenantId,
              locationId: targetOrder.locationId,
              orderId: targetOrder.id,
              mpPaymentId: providerPaymentId,
              grossAmount,
              feeAmount,
              feeDetails,
              taxesAmount,
              taxesDetails,
              netReceivedAmount,
              isFeeInclusiveOfTax,
              moneyReleaseStatus,
              moneyReleaseExpectedAt,
              moneyReleasedAt,
              settlementDate,
            })
            .onConflictDoUpdate({
              target: mpFinancialRecords.mpPaymentId,
              set: {
                locationId: targetOrder.locationId,
                orderId: targetOrder.id,
                grossAmount,
                feeAmount,
                feeDetails,
                taxesAmount,
                taxesDetails,
                netReceivedAmount,
                isFeeInclusiveOfTax,
                moneyReleaseStatus,
                moneyReleaseExpectedAt,
                moneyReleasedAt,
                settlementDate,
                updatedAt: new Date(),
              },
            });
        }
      }
    }
    return { tenantId: account.tenantId, duplicate: false, routed: true, outOfOrder, paymentAttemptId: attempt.id, webhookEventId: event.id };
  });
}
