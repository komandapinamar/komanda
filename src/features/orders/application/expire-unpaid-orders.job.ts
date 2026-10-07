import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { tenantOrders } from "@/db/schema";
import {
  withPlatformServiceTransaction,
  withTenantTransaction,
} from "@/db/tenant-transaction";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export type ExpireUnpaidCashOrdersResult = {
  expiredCount: number;
  expiredOrderIds: string[];
  failedCount?: number;
  failedOrderIds?: string[];
};

export type ExpireUnpaidCashOrdersOptions = {
  batchSize?: number;
  now?: () => Date;
  tenantId?: string;
  correlationId?: string;
  db?: typeof defaultDb;
};

export function buildExpireCandidatesQuery(
  database: typeof defaultDb,
  currentTime: Date,
  options?: { batchSize?: number; tenantId?: string },
) {
  const batchSize = Math.max(1, options?.batchSize ?? 50);
  const conditions = [
    eq(tenantOrders.source, "storefront_cash"),
    eq(tenantOrders.paymentStatus, "pending"),
    eq(tenantOrders.fulfillmentStatus, "approved"),
    isNotNull(tenantOrders.paymentExpiresAt),
    lte(tenantOrders.paymentExpiresAt, currentTime),
  ];

  if (options?.tenantId) {
    conditions.push(eq(tenantOrders.tenantId, options.tenantId));
  }

  return database
    .select({
      id: tenantOrders.id,
      tenantId: tenantOrders.tenantId,
      version: tenantOrders.version,
    })
    .from(tenantOrders)
    .where(and(...conditions))
    .orderBy(asc(tenantOrders.paymentExpiresAt))
    .limit(batchSize);
}

export async function expireUnpaidCashOrders(
  options: ExpireUnpaidCashOrdersOptions = {},
): Promise<ExpireUnpaidCashOrdersResult> {
  const database = options.db ?? defaultDb;
  const now = options.now ?? (() => new Date());
  const currentTime = now();
  const correlationId = options.correlationId ?? randomUUID();

  const candidates = options.db
    ? await buildExpireCandidatesQuery(options.db, currentTime, options)
    : await withPlatformServiceTransaction(
        {
          serviceId: "order:expiration-scanner",
          correlationId,
        },
        async (tx) =>
          buildExpireCandidatesQuery(
            tx as unknown as typeof defaultDb,
            currentTime,
            options,
          ),
      );

  if (!candidates || candidates.length === 0) {
    return {
      expiredCount: 0,
      expiredOrderIds: [],
    };
  }

  const expiredOrderIds: string[] = [];
  const failedOrderIds: string[] = [];

  for (const candidate of candidates) {
    try {
      const correlationId = options.correlationId ?? randomUUID();
      const context = createVerifiedTenantContext({
        tenantId: candidate.tenantId,
        correlationId,
        source: "background",
        actor: { kind: "system", process: "expire-unpaid-orders-job" },
      });

      await withTenantTransaction(context, async (transaction) => {
        const [order] = await transaction
          .select()
          .from(tenantOrders)
          .where(
            and(
              eq(tenantOrders.tenantId, candidate.tenantId),
              eq(tenantOrders.id, candidate.id),
            ),
          )
          .limit(1);

        if (!order) return;

        // Invariant AD-2 & Idempotency: Only expire storefront_cash pending orders whose TTL expired
        if (
          order.source !== "storefront_cash" ||
          order.paymentStatus !== "pending" ||
          order.fulfillmentStatus !== "approved" ||
          !order.paymentExpiresAt ||
          new Date(order.paymentExpiresAt).getTime() > currentTime.getTime()
        ) {
          return;
        }

        const [updated] = await transaction
          .update(tenantOrders)
          .set({
            fulfillmentStatus: "cancelled",
            paymentStatus: "failed",
            version: sql`${tenantOrders.version} + 1`,
            updatedAt: currentTime,
          })
          .where(
            and(
              eq(tenantOrders.tenantId, order.tenantId),
              eq(tenantOrders.id, order.id),
              eq(tenantOrders.version, order.version),
            ),
          )
          .returning();

        if (!updated) return;

        if (order.discountSnapshot) {
          const discountRepo = new DiscountRepository(
            transaction,
            order.tenantId,
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
            reason: "unpaid_cash_expired",
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
            reason: "unpaid_cash_expired",
          },
        });

        expiredOrderIds.push(order.id);
      });
    } catch {
      failedOrderIds.push(candidate.id);
    }
  }

  return {
    expiredCount: expiredOrderIds.length,
    expiredOrderIds,
    ...(failedOrderIds.length > 0 ? { failedCount: failedOrderIds.length, failedOrderIds } : {}),
  };
}

export class ExpireUnpaidOrdersJob {
  constructor(private readonly options: ExpireUnpaidCashOrdersOptions = {}) {}

  async run(): Promise<ExpireUnpaidCashOrdersResult> {
    return expireUnpaidCashOrders(this.options);
  }
}
