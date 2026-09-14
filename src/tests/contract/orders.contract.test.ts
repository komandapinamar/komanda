import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("orders producer contract", () => {
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
