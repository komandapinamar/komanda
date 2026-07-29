import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

describe("orders producer contract", () => {
  it("publishes tenant order list/detail/create/transition and event cursor operations", async () => {
    const document = parse(
      await readFile(
        resolve(process.cwd(), "../specs/001-multi-tenant-base/contracts/openapi.yaml"),
        "utf8",
      ),
    ) as { paths: Record<string, Record<string, unknown>> };

    expect(document.paths["/api/v1/tenants/{tenantId}/orders"]?.get).toBeDefined();
    expect(document.paths["/api/v1/tenants/{tenantId}/orders"]?.post).toBeDefined();
    expect(
      document.paths["/api/v1/tenants/{tenantId}/orders/{orderId}"]?.get,
    ).toBeDefined();
    expect(
      document.paths["/api/v1/tenants/{tenantId}/orders/{orderId}"]?.patch,
    ).toBeDefined();
    expect(
      document.paths["/api/v1/tenants/{tenantId}/orders/events"]?.get,
    ).toBeDefined();
  });

  it("has implemented route adapters for every order contract operation", async () => {
    const routeSources = await Promise.all([
      readFile("app/api/v1/tenants/[tenantId]/orders/route.ts", "utf8"),
      readFile("app/api/v1/tenants/[tenantId]/orders/[orderId]/route.ts", "utf8"),
      readFile("app/api/v1/tenants/[tenantId]/orders/events/route.ts", "utf8"),
    ]);

    expect(routeSources[0]).toContain("CreateOrderService");
    expect(routeSources[0]).toContain("OrderQueryService");
    expect(routeSources[1]).toContain("TransitionOrderService");
    expect(routeSources[2]).toContain("last-event-id");
  });
});
