import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { cashShifts, tenantLocations, tenantOrders } from "@/db/schema";
import {
  PublicTenantService,
  type PublicTenant,
} from "@/features/tenancy/application/public-tenant.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import {
  analyticsDateFilterSchema,
  ingestTelemetryBatchSchema,
  recordStorefrontSessionSchema,
  type AnalyticsDateFilterInput,
} from "../domain/analytics.schemas";
import { AnalyticsRepository } from "../infrastructure/analytics.repository";
import { BillingRepository } from "@/features/billing/infrastructure/billing.repository";

export class ForbiddenRoleError extends Error {
  readonly code = "FORBIDDEN_ROLE";
  constructor(message = "Access is restricted to the owner role.") {
    super(message);
    this.name = "ForbiddenRoleError";
  }
}

export function requireTenantRole(
  context: TenantContext,
  requiredRole: "owner",
) {
  if (context.actor.kind !== "user" || context.actor.role !== requiredRole) {
    throw new ForbiddenRoleError(
      `Access is restricted to the ${requiredRole} role.`,
    );
  }
}

function publicContext(tenant: PublicTenant) {
  return createVerifiedTenantContext({
    tenantId: tenant.id,
    locationId: tenant.locationId,
    correlationId: randomUUID(),
    source: "public",
    actor: { kind: "anonymous", tenantSlug: tenant.slug },
  });
}

export class AnalyticsService {
  constructor(private readonly tenants = new PublicTenantService()) {}

  async recordStorefrontSession(slug: string, payload: unknown) {
    const data = recordStorefrontSessionSchema.parse(payload);
    const tenant = await this.tenants.resolve(slug);

    return withTenantTransaction(publicContext(tenant), async (transaction) => {
      const repository = new AnalyticsRepository(transaction, tenant.id);
      return repository.upsertSession(data);
    });
  }

  async ingestTelemetryBatch(slug: string, payload: unknown) {
    const data = ingestTelemetryBatchSchema.parse(payload);
    const tenant = await this.tenants.resolve(slug);

    return withTenantTransaction(publicContext(tenant), async (transaction) => {
      const repository = new AnalyticsRepository(transaction, tenant.id);
      return repository.insertItemEvents(tenant.locationId, data);
    });
  }

  async getDashboardMetrics(input: {
    context: TenantContext;
    filter?: Partial<AnalyticsDateFilterInput>;
  }) {
    requireTenantRole(input.context, "owner");

    const filter = analyticsDateFilterSchema.parse(input.filter ?? {});
    const now = new Date();
    const to = filter.to ? new Date(filter.to) : now;
    // Default to last 7 days if not specified
    const from = filter.from ? new Date(filter.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return withTenantTransaction(input.context, async (transaction) => {
      let locationId = input.context.locationId;
      if (!locationId) {
        const [loc] = await transaction
          .select({ id: tenantLocations.id })
          .from(tenantLocations)
          .where(
            and(
              eq(tenantLocations.tenantId, input.context.tenantId),
              eq(tenantLocations.isPrimary, true),
              eq(tenantLocations.status, "active"),
            ),
          )
          .limit(1);
        locationId = loc?.id;
      }

      const analyticsRepo = new AnalyticsRepository(transaction, input.context.tenantId);
      const billingRepo = new BillingRepository(transaction, input.context.tenantId);

      const dwellMetrics = await analyticsRepo.getDwellMetrics(from, to);
      const dwellTimeline = await analyticsRepo.getDwellTimeline(
        from,
        to,
        filter.granularity === "hour" ? "hour" : "day",
      );
      const financialSummary = await analyticsRepo.getFinancialSummary({
        from,
        to,
        locationId,
        source: filter.source,
      });
      const revenueTimeline = await billingRepo.getRevenueTimeline(
        from,
        to,
        filter.granularity === "hour" ? "hour" : "day",
        filter.source,
      );
      const topProductsByQty = await billingRepo.getTopSellingProducts({
        from,
        to,
        categoryId: filter.categoryId,
        source: filter.source,
        sortBy: "quantity",
        limit: 10,
      });
      const topProductsByRevenue = await billingRepo.getTopSellingProducts({
        from,
        to,
        categoryId: filter.categoryId,
        source: filter.source,
        sortBy: "revenue",
        limit: 10,
      });

      const kitchenDelays = await analyticsRepo.getKitchenDelaysSummary(
        from,
        to,
        locationId,
      );
      const peakHoursHeatmap = await analyticsRepo.getPeakHoursHeatmap(
        from,
        to,
        locationId,
      );
      const unconvertedProducts = await analyticsRepo.getUnconvertedProducts(
        from,
        to,
        locationId,
      );
      const customerRecurrence = await analyticsRepo.getCustomerRecurrenceSummary(
        from,
        to,
        locationId,
      );
      const promotions = await analyticsRepo.getPromotionsSummary(
        from,
        to,
        locationId,
      );

      // Tender breakdown (Efectivo vs Tarjeta/Posnet)
      let tenderBreakdown: Array<{ tender: string; revenue: string; ordersCount: number }> = [];
      let currentCashShift = null;

      if (typeof (transaction as { select?: unknown }).select === "function") {
        const tenderRows = await transaction
          .select({
            tender: tenantOrders.tender,
            totalRevenue: sql<string>`coalesce(sum(${tenantOrders.total}), 0)::text`,
            ordersCount: sql<number>`count(*)::int`,
          })
          .from(tenantOrders)
          .where(
            and(
              eq(tenantOrders.tenantId, input.context.tenantId),
              eq(tenantOrders.paymentStatus, "paid"),
              sql`${tenantOrders.createdAt} >= ${from}`,
              sql`${tenantOrders.createdAt} <= ${to}`,
            ),
          )
          .groupBy(tenantOrders.tender);

        tenderBreakdown = tenderRows.map((r) => ({
          tender: r.tender,
          revenue: r.totalRevenue,
          ordersCount: r.ordersCount,
        }));

        // Current Cash Shift (if open)
        const [openShift] = await transaction
          .select()
          .from(cashShifts)
          .where(
            and(
              eq(cashShifts.tenantId, input.context.tenantId),
              eq(cashShifts.status, "open"),
            ),
          )
          .limit(1);

        if (openShift) {
          const [sales] = await transaction
            .select({
              totalCash: sql<string>`coalesce(sum(${tenantOrders.total}), 0)::text`,
            })
            .from(tenantOrders)
            .where(
              and(
                eq(tenantOrders.tenantId, input.context.tenantId),
                eq(tenantOrders.tender, "cash"),
                eq(tenantOrders.paymentStatus, "paid"),
                sql`${tenantOrders.createdAt} >= ${openShift.openedAt}`,
              ),
            );

          const opening = Number(openShift.openingBalance) || 0;
          const cashSales = Number(sales?.totalCash) || 0;
          const expected = (opening + cashSales).toFixed(2);

          currentCashShift = {
            id: openShift.id,
            openingBalance: openShift.openingBalance,
            expectedCash: expected,
            currentCashSales: sales?.totalCash ?? "0.00",
            status: openShift.status,
            openedAt: openShift.openedAt.toISOString(),
          };
        }
      }

      return {
        dateRange: {
          from: from.toISOString(),
          to: to.toISOString(),
          granularity: filter.granularity,
        },
        dwell: dwellMetrics,
        dwellTimeline,
        financial: financialSummary,
        revenueTimeline,
        topProducts: {
          byQuantity: topProductsByQty,
          byRevenue: topProductsByRevenue,
        },
        kitchenDelays,
        peakHoursHeatmap,
        unconvertedProducts,
        customerRecurrence,
        promotions,
        tenderBreakdown,
        currentCashShift,
      };
    });
  }

  async getKitchenDelays(
    context: TenantContext,
    from: Date,
    to: Date,
    locationId?: string,
  ) {
    requireTenantRole(context, "owner");
    return withTenantTransaction(context, async (transaction) => {
      const repo = new AnalyticsRepository(transaction, context.tenantId);
      return repo.getKitchenDelaysSummary(from, to, locationId);
    });
  }

  async getPeakHoursHeatmap(
    context: TenantContext,
    from: Date,
    to: Date,
    locationId?: string,
  ) {
    requireTenantRole(context, "owner");
    return withTenantTransaction(context, async (transaction) => {
      const repo = new AnalyticsRepository(transaction, context.tenantId);
      return repo.getPeakHoursHeatmap(from, to, locationId);
    });
  }

  async getUnconvertedProducts(
    context: TenantContext,
    from: Date,
    to: Date,
    locationId?: string,
  ) {
    requireTenantRole(context, "owner");
    return withTenantTransaction(context, async (transaction) => {
      const repo = new AnalyticsRepository(transaction, context.tenantId);
      return repo.getUnconvertedProducts(from, to, locationId);
    });
  }

  async getCustomerRecurrence(
    context: TenantContext,
    from: Date,
    to: Date,
    locationId?: string,
  ) {
    requireTenantRole(context, "owner");
    return withTenantTransaction(context, async (transaction) => {
      const repo = new AnalyticsRepository(transaction, context.tenantId);
      return repo.getCustomerRecurrenceSummary(from, to, locationId);
    });
  }

  async getPromotionsSummary(
    context: TenantContext,
    from: Date,
    to: Date,
    locationId?: string,
  ) {
    requireTenantRole(context, "owner");
    return withTenantTransaction(context, async (transaction) => {
      const repo = new AnalyticsRepository(transaction, context.tenantId);
      return repo.getPromotionsSummary(from, to, locationId);
    });
  }
}
