import { randomUUID } from "node:crypto";
import { withTenantTransaction } from "@/db/tenant-transaction";
import {
  PublicTenantService,
  type PublicTenant,
} from "@/features/tenancy/application/public-tenant.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import {
  analyticsDateFilterSchema,
  recordStorefrontSessionSchema,
  type AnalyticsDateFilterInput,
} from "../domain/analytics.schemas";
import { AnalyticsRepository } from "../infrastructure/analytics.repository";
import { BillingRepository } from "@/features/billing/infrastructure/billing.repository";

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

  async getDashboardMetrics(input: {
    context: TenantContext;
    filter?: Partial<AnalyticsDateFilterInput>;
  }) {
    const filter = analyticsDateFilterSchema.parse(input.filter ?? {});
    const now = new Date();
    const to = filter.to ? new Date(filter.to) : now;
    // Default to last 7 days if not specified
    const from = filter.from ? new Date(filter.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return withTenantTransaction(input.context, async (transaction) => {
      const analyticsRepo = new AnalyticsRepository(transaction, input.context.tenantId);
      const billingRepo = new BillingRepository(transaction, input.context.tenantId);

      const dwellMetrics = await analyticsRepo.getDwellMetrics(from, to);
      const dwellTimeline = await analyticsRepo.getDwellTimeline(
        from,
        to,
        filter.granularity === "hour" ? "hour" : "day",
      );
      const financialSummary = await billingRepo.getFinancialSummary(from, to, filter.source);
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
      };
    });
  }
}
