import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("query budgets", () => {
  it("keeps critical indexes tenant-first and avoids full-order SSE polling", async () => {
    const [ordersMigration, printingMigration, orderStream] = await Promise.all([
      readFile("drizzle/0009_multitenant_orders.sql", "utf8"),
      readFile("drizzle/0010_multitenant_printing.sql", "utf8"),
      readFile("app/api/v1/tenants/[tenantId]/orders/events/route.ts", "utf8"),
    ]);

    expect(ordersMigration).toContain(
      'CREATE INDEX IF NOT EXISTS "orders_tenant_fulfillment_idx" ON "orders" ("tenant_id", "fulfillment_status", "approved_at")',
    );
    expect(ordersMigration).toContain(
      'CREATE INDEX IF NOT EXISTS "order_events_tenant_sequence_idx" ON "order_events" ("tenant_id", "sequence")',
    );
    expect(printingMigration).toContain(
      'CREATE INDEX IF NOT EXISTS "print_jobs_tenant_location_status_idx" ON "print_jobs" ("tenant_id", "location_id", "status", "next_attempt_at")',
    );
    expect(orderStream).toContain("eventsAfter");
    expect(orderStream).not.toContain("listOrdersInProgress");
  });
});
