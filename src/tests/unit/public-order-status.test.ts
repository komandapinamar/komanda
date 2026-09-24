import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { withTenantIdTransaction } = vi.hoisted(() => ({
  withTenantIdTransaction: vi.fn(),
}));
vi.mock("@/db/tenant-transaction", () => ({ withTenantIdTransaction }));

import { GET } from "@/app/api/v1/public/orders/[tenantId]/[orderId]/status/route";

const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
const orderId = "62d47dd7-d84d-4313-87f1-d0e72dfafafe";
const otherTenantId = "aac7f012-33f8-49c0-80ad-31a35d3a3f01";
const request = new Request("https://komanda.example/api/v1/public/orders/status");
const route = (tenant: string, order: string) => ({ params: Promise.resolve({ tenantId: tenant, orderId: order }) });

describe("public order tracking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only public fields and scopes by both tenant and order", async () => {
    const where = vi.fn();
    withTenantIdTransaction.mockImplementation(async (_ctx, callback) => callback({
      select: () => ({ from: () => ({ where: (condition: unknown) => {
        where(condition);
        return { limit: async () => [{ purchaseNumber: BigInt("42"), fulfillmentStatus: "ready" }] };
      } }) }),
    }));
    const response = await GET(request, route(tenantId, orderId));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ purchaseNumber: "42", fulfillmentStatus: "ready" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain("tenant_id");
    expect(query.sql).toContain("id");
    expect(query.params).toEqual([tenantId, orderId]);
    expect(withTenantIdTransaction).toHaveBeenCalledWith(tenantId, expect.any(Function));
  });

  it("returns the same 404 for an unknown order or an order in a different tenant", async () => {
    withTenantIdTransaction.mockImplementation(async (_ctx, callback) => callback({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    }));
    const unknown = await GET(request, route(tenantId, orderId));
    const crossTenant = await GET(request, route(otherTenantId, orderId));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual(await crossTenant.json());
    expect(crossTenant.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reflects subsequent kitchen transitions without leaking private fields", async () => {
    let state = "preparing";
    withTenantIdTransaction.mockImplementation(async (_ctx, callback) => callback({
      select: () => ({ from: () => ({ where: () => ({
        limit: async () => [{ purchaseNumber: BigInt("42"), fulfillmentStatus: state }],
      }) }) }),
    }));
    const preparing = await GET(request, route(tenantId, orderId));
    state = "ready";
    const ready = await GET(request, route(tenantId, orderId));
    expect(await preparing.json()).toEqual({ purchaseNumber: "42", fulfillmentStatus: "preparing" });
    expect(await ready.json()).toEqual({ purchaseNumber: "42", fulfillmentStatus: "ready" });
  });

  it("rejects invalid identifiers without querying the database", async () => {
    expect((await GET(request, route("invalid", orderId))).status).toBe(404);
    expect(withTenantIdTransaction).not.toHaveBeenCalled();
  });
});
