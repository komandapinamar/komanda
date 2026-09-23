import "server-only";

import { and, eq, lte, or, sql } from "drizzle-orm";
import { paymentAttempts, tenantOrders } from "@/db/schema";
import { withPlatformServiceTransaction, withTenantTransaction } from "@/db/tenant-transaction";
import { IntegrationRepository } from "@/features/payments/infrastructure/integration.repository";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import {
  type MercadoPagoPayment,
  type MercadoPagoPaymentLookup,
  MercadoPagoTenantPaymentClient,
} from "@/features/payments/application/mercadopago-webhook.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import { emitMetric } from "@/lib/observability/metrics";

const DEFAULT_THRESHOLD_SECONDS = 30;
const ALERT_LAG_MS = 5 * 60 * 1000; // 5 minutes

export type ReconciliationResult = {
  attemptId: string;
  previousStatus: string;
  nextStatus: string;
  orderId?: string | null;
  resolved: boolean;
};

export class PaymentReconciliationService {
  constructor(
    private readonly paymentClient: MercadoPagoPaymentLookup = new MercadoPagoTenantPaymentClient(),
  ) {}

  async reconcilePaymentAttempt(input: {
    tenantId: string;
    attemptId: string;
    correlationId?: string;
  }): Promise<ReconciliationResult> {
    const correlationId = input.correlationId ?? "reconciliation:worker";
    const context = createVerifiedTenantContext({
      tenantId: input.tenantId,
      correlationId,
      source: "background",
      actor: { kind: "service", serviceId: "payment:reconciler" },
    });

    return withTenantTransaction(context, async (transaction) => {
      const integrations = new IntegrationRepository(transaction, input.tenantId);
      const orders = new OrderRepository(transaction, context);

      const [attempt] = await transaction
        .select()
        .from(paymentAttempts)
        .where(
          and(
            eq(paymentAttempts.tenantId, input.tenantId),
            eq(paymentAttempts.id, input.attemptId),
          ),
        )
        .limit(1);

      if (!attempt) {
        throw new Error(`Payment attempt ${input.attemptId} not found.`);
      }

      if (attempt.status === "approved" || attempt.status === "rejected" || attempt.status === "failed") {
        return {
          attemptId: attempt.id,
          previousStatus: attempt.status,
          nextStatus: attempt.status,
          resolved: true,
        };
      }

      if (!attempt.providerPaymentId) {
        // Without provider ID, cannot actively query provider.
        return {
          attemptId: attempt.id,
          previousStatus: attempt.status,
          nextStatus: attempt.status,
          resolved: false,
        };
      }

      const account = await integrations.currentMercadoPago();
      if (!account) {
        throw new Error(`Active integration account not found for tenant ${input.tenantId}.`);
      }
      const tokens = integrations.decryptTokens(account);

      let payment: MercadoPagoPayment;
      try {
        payment = await this.paymentClient.getPayment(tokens.accessToken, attempt.providerPaymentId);
      } catch (error) {
        emitMetric("payment.reconciliation_failed", {
          tenantId: input.tenantId,
          result: "failed",
          tags: { attemptId: attempt.id, error: error instanceof Error ? error.message : "unknown" },
        });
        return {
          attemptId: attempt.id,
          previousStatus: attempt.status,
          nextStatus: "verification_required",
          resolved: false,
        };
      }

      const providerStatus = payment.status;
      const [existingOrder] = await transaction
        .select()
        .from(tenantOrders)
        .where(
          and(
            eq(tenantOrders.tenantId, input.tenantId),
            eq(tenantOrders.paymentAttemptId, attempt.id),
          ),
        )
        .limit(1);

      if (providerStatus === "approved") {
        const approvedAt = payment.date_approved ? new Date(payment.date_approved) : new Date();

        await transaction
          .update(paymentAttempts)
          .set({
            status: "approved",
            processedAt: approvedAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentAttempts.tenantId, input.tenantId),
              eq(paymentAttempts.id, attempt.id),
            ),
          );

        let targetOrderId = existingOrder?.id ?? null;

        if (existingOrder && existingOrder.paymentStatus !== "paid") {
          await orders.updatePaymentStatus({
            orderId: existingOrder.id,
            paymentStatus: "paid",
          });
          await appendOutboxEvent(transaction, context, {
            aggregateType: "order",
            aggregateId: existingOrder.id,
            eventType: "order.paid",
            payload: { orderId: existingOrder.id, previousStatus: existingOrder.paymentStatus },
          });
        } else if (!existingOrder) {
          const cart = await orders.loadCart(attempt.cartId);
          if (cart && cart.status !== "converted") {
            const createResult = await orders.createFromCartSnapshot({
              cart,
              source: "mercadopago_webhook",
              paymentStatus: "paid",
              customer: attempt.customerSnapshot,
              notes: attempt.notes ?? undefined,
              idempotencyKey: `payment-attempt:${attempt.id}`,
              paymentAttemptId: attempt.id,
              approvedAt,
            });
            if (createResult.order) {
              targetOrderId = createResult.order.id;
              await appendAuditEvent(transaction, context, {
                action: "order.create_paid",
                resourceType: "order",
                resourceId: createResult.order.id,
                outcome: "allowed",
                metadata: { cartId: cart.id, paymentAttemptId: attempt.id },
              });
              await appendOutboxEvent(transaction, context, {
                aggregateType: "order",
                aggregateId: createResult.order.id,
                eventType: "order.created",
                payload: { orderId: createResult.order.id, paymentStatus: "paid" },
              });
              await appendOutboxEvent(transaction, context, {
                aggregateType: "order",
                aggregateId: createResult.order.id,
                eventType: "print.intent.created",
                payload: { orderId: createResult.order.id, paymentStatus: "paid" },
              });
            }
          }
        }

        emitMetric("payment.reconciled", {
          tenantId: input.tenantId,
          result: "ok",
          tags: { attemptId: attempt.id, orderId: targetOrderId ?? "" },
        });

        return {
          attemptId: attempt.id,
          previousStatus: attempt.status,
          nextStatus: "approved",
          orderId: targetOrderId,
          resolved: true,
        };
      }

      if (providerStatus === "rejected" || providerStatus === "cancelled") {
        await transaction
          .update(paymentAttempts)
          .set({
            status: "rejected",
            failureCode: "provider_rejected",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentAttempts.tenantId, input.tenantId),
              eq(paymentAttempts.id, attempt.id),
            ),
          );

        if (existingOrder && existingOrder.paymentStatus === "verification_required") {
          await orders.updatePaymentStatus({
            orderId: existingOrder.id,
            paymentStatus: "failed",
          });
        }

        emitMetric("payment.reconciled", {
          tenantId: input.tenantId,
          result: "failed",
          tags: { attemptId: attempt.id, reason: providerStatus },
        });

        return {
          attemptId: attempt.id,
          previousStatus: attempt.status,
          nextStatus: "rejected",
          orderId: existingOrder?.id ?? null,
          resolved: true,
        };
      }

      // Still pending or in_process at provider
      const ageMs = Date.now() - attempt.createdAt.getTime();
      if (ageMs > ALERT_LAG_MS) {
        emitMetric("payment.verification_lag_alert", {
          tenantId: input.tenantId,
          tags: { attemptId: attempt.id, ageSeconds: String(Math.round(ageMs / 1000)) },
        });
      }

      if (attempt.status !== "verification_required") {
        await transaction
          .update(paymentAttempts)
          .set({ status: "verification_required", updatedAt: new Date() })
          .where(
            and(
              eq(paymentAttempts.tenantId, input.tenantId),
              eq(paymentAttempts.id, attempt.id),
            ),
          );
      }

      return {
        attemptId: attempt.id,
        previousStatus: attempt.status,
        nextStatus: "verification_required",
        orderId: existingOrder?.id ?? null,
        resolved: false,
      };
    });
  }

  async scanAndReconcileUncertainPayments(options?: {
    thresholdSeconds?: number;
    limit?: number;
  }) {
    const threshold = options?.thresholdSeconds ?? DEFAULT_THRESHOLD_SECONDS;
    const limit = options?.limit ?? 50;

    type Candidate = {
      id: string;
      tenantId: string;
      status: string;
      createdAt: Date;
    };

    const candidates = await withPlatformServiceTransaction<Candidate[]>(
      { serviceId: "payment:reconciliation-scanner", correlationId: "reconciliation:scanner" },
      async (transaction) => {
        const rows = await transaction
          .select({
            id: paymentAttempts.id,
            tenantId: paymentAttempts.tenantId,
            status: paymentAttempts.status,
            createdAt: paymentAttempts.createdAt,
          })
          .from(paymentAttempts)
          .where(
            and(
              or(
                eq(paymentAttempts.status, "verification_required"),
                and(
                  or(eq(paymentAttempts.status, "pending"), eq(paymentAttempts.status, "processing")),
                  lte(paymentAttempts.createdAt, sql`now() - make_interval(secs => ${threshold})`),
                ),
              ),
              sql`${paymentAttempts.providerPaymentId} is not null`,
            ),
          )
          .limit(limit);
        return rows as Candidate[];
      },
    );

    let reconciled = 0;
    let pendingVerification = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const result = await this.reconcilePaymentAttempt({
          tenantId: candidate.tenantId,
          attemptId: candidate.id,
        });
        if (result.resolved) {
          reconciled += 1;
        } else {
          pendingVerification += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return {
      scanned: candidates.length,
      reconciled,
      pendingVerification,
      failed,
    };
  }
}
