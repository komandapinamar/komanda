import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("orders tenant isolation", () => {
  it("uses tenant-qualified numbering, idempotency, relationships and RLS", async () => {
    const migration = await readFile("drizzle/0000_initial_schema.sql", "utf8");

    expect(migration).toContain('UNIQUE("tenant_id","purchase_number")');
    expect(migration).toContain('UNIQUE("tenant_id","idempotency_key")');
    expect(migration).toContain(
      'FOREIGN KEY ("tenant_id","cart_id") REFERENCES "public"."carts"("tenant_id","id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id")',
    );
    for (const table of [
      "orders",
      "order_lines",
      "order_line_options",
      "order_events",
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`${table}_runtime_isolation`);
    }
  });

  it("keeps order queries and transitions inside the verified tenant context", async () => {
    const [repository, queryService, transitionService] = await Promise.all([
      readFile("features/orders/infrastructure/order.repository.ts", "utf8"),
      readFile("features/orders/application/order-query.service.ts", "utf8"),
      readFile("features/orders/application/transition-order.service.ts", "utf8"),
    ]);

    expect(repository).toContain("eq(tenantOrders.tenantId, this.tenantId)");
    expect(repository).toContain("nextCounter(\"purchase_number\")");
    expect(repository).toContain("nextCounter(\"order_event_sequence\")");
    expect(queryService).toContain("withTenantTransaction(input.context");
    expect(transitionService).toContain("expectedVersion");
    expect(transitionService).toContain("appendTransitionEvent");
  });

  it("uses cursor-based tenant SSE instead of full-order polling", async () => {
    const [component, route] = await Promise.all([
      readFile("features/orders/web/AdminOrdersLive.tsx", "utf8"),
      readFile("app/api/v1/tenants/[tenantId]/orders/events/route.ts", "utf8"),
    ]);

    expect(component).toContain("/orders/events");
    expect(component).not.toContain("/api/admin/orders/stream\";");
    expect(route).toContain("eventsAfter");
    expect(route).toContain("last-event-id");
    expect(route).not.toContain("listOrdersInProgress");
  });
});
