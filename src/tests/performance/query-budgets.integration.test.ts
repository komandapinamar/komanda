import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("query budgets", () => {
  it("keeps critical indexes tenant-first and avoids full-order SSE polling", async () => {
    const [schemaMigration, orderStream] = await Promise.all([
      readFile("drizzle/0000_initial_schema.sql", "utf8"),
      readFile("app/api/v1/tenants/[tenantId]/orders/events/route.ts", "utf8"),
    ]);

    expect(schemaMigration).toContain(
      'CREATE INDEX "orders_tenant_fulfillment_idx" ON "orders" USING btree ("tenant_id","fulfillment_status","approved_at")',
    );
    expect(schemaMigration).toContain(
      'CREATE INDEX "order_events_tenant_sequence_idx" ON "order_events" USING btree ("tenant_id","sequence")',
    );
    expect(schemaMigration).toContain(
      'CREATE INDEX "print_jobs_tenant_location_status_idx" ON "print_jobs" USING btree ("tenant_id","location_id","status","next_attempt_at")',
    );
    expect(orderStream).toContain("eventsAfter");
    expect(orderStream).not.toContain("listOrdersInProgress");
  });
});
