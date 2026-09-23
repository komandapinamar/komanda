import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  vAnalyticsTenants,
  vAnalyticsOrders,
  vAnalyticsOrderItems,
  vAnalyticsTenantActivity,
} from "@/db/schema/analytics";

describe("PRD Analítica: Vistas Sanitizadas y Seguridad de Acceso", () => {
  it("exports vAnalyticsTenants with non-sensitive platform columns", () => {
    expect(vAnalyticsTenants.tenantId).toBeDefined();
    expect(vAnalyticsTenants.name).toBeDefined();
    expect(vAnalyticsTenants.slug).toBeDefined();
    expect(vAnalyticsTenants.status).toBeDefined();
    expect(vAnalyticsTenants.preset).toBeDefined();
    expect(vAnalyticsTenants.defaultCurrency).toBeDefined();
    expect(vAnalyticsTenants.defaultTimezone).toBeDefined();
  });

  it("exports vAnalyticsOrders excluding sensitive PII (pickup_pin, customer_snapshot, notes, idempotency_key)", () => {
    expect(vAnalyticsOrders.orderId).toBeDefined();
    expect(vAnalyticsOrders.tenantId).toBeDefined();
    expect(vAnalyticsOrders.purchaseNumber).toBeDefined();
    expect(vAnalyticsOrders.subtotal).toBeDefined();
    expect(vAnalyticsOrders.total).toBeDefined();
    expect(vAnalyticsOrders.paymentStatus).toBeDefined();

    // Strict security assertions: ensure sensitive columns are NEVER exposed
    expect((vAnalyticsOrders as unknown as Record<string, unknown>).pickupPin).toBeUndefined();
    expect((vAnalyticsOrders as unknown as Record<string, unknown>).customerSnapshot).toBeUndefined();
    expect((vAnalyticsOrders as unknown as Record<string, unknown>).notes).toBeUndefined();
    expect((vAnalyticsOrders as unknown as Record<string, unknown>).idempotencyKey).toBeUndefined();
  });

  it("exports vAnalyticsOrderItems for demand tracking", () => {
    expect(vAnalyticsOrderItems.orderLineId).toBeDefined();
    expect(vAnalyticsOrderItems.orderId).toBeDefined();
    expect(vAnalyticsOrderItems.itemName).toBeDefined();
    expect(vAnalyticsOrderItems.quantity).toBeDefined();
    expect(vAnalyticsOrderItems.unitPrice).toBeDefined();
    expect(vAnalyticsOrderItems.lineTotal).toBeDefined();
  });

  it("exports vAnalyticsTenantActivity with real-time operational indicators", () => {
    expect(vAnalyticsTenantActivity.tenantId).toBeDefined();
    expect(vAnalyticsTenantActivity.tenantName).toBeDefined();
    expect(vAnalyticsTenantActivity.hasOpenCashShift).toBeDefined();
    expect(vAnalyticsTenantActivity.activePrintersCount).toBeDefined();
    expect(vAnalyticsTenantActivity.ordersTodayCount).toBeDefined();
    expect(vAnalyticsTenantActivity.lastOrderAt).toBeDefined();
  });

  it("ensures migration 0018 enforces security_barrier = true and least privilege role", async () => {
    const migrationSql = await readFile(
      "drizzle/0018_add_sanitized_analytics_views.sql",
      "utf8",
    );

    // Role assertions
    expect(migrationSql).toContain("CREATE ROLE komanda_analytics");
    expect(migrationSql).toContain("NOSUPERUSER");
    expect(migrationSql).toContain("NOBYPASSRLS");

    // Security barrier assertions
    expect(migrationSql).toContain("CREATE OR REPLACE VIEW public.v_analytics_tenants\nWITH (security_barrier = true)");
    expect(migrationSql).toContain("CREATE OR REPLACE VIEW public.v_analytics_orders\nWITH (security_barrier = true)");
    expect(migrationSql).toContain("CREATE OR REPLACE VIEW public.v_analytics_order_items\nWITH (security_barrier = true)");
    expect(migrationSql).toContain("CREATE OR REPLACE VIEW public.v_analytics_tenant_activity\nWITH (security_barrier = true)");

    // Only grants SELECT on views to komanda_analytics
    expect(migrationSql).toContain("GRANT SELECT ON public.v_analytics_tenants TO komanda_analytics;");
    expect(migrationSql).toContain("GRANT SELECT ON public.v_analytics_orders TO komanda_analytics;");
    expect(migrationSql).toContain("GRANT SELECT ON public.v_analytics_order_items TO komanda_analytics;");
    expect(migrationSql).toContain("GRANT SELECT ON public.v_analytics_tenant_activity TO komanda_analytics;");
  });
});
