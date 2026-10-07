import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExpire = vi.hoisted(() => vi.fn());

vi.mock("@/features/orders/application/expire-unpaid-orders.job", () => ({
  expireUnpaidCashOrders: mockExpire,
}));

import { POST } from "@/app/api/v1/internal/cron/expire-unpaid-cash-orders/route";

describe("Story 1.4 hardening: internal cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "super-secret";
    mockExpire.mockResolvedValue({ expiredCount: 0, expiredOrderIds: [] });
  });

  const makeRequest = (opts: { auth?: string | null; body?: unknown } = {}) =>
    new Request(
      "http://localhost/api/v1/internal/cron/expire-unpaid-cash-orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(opts.auth ? { Authorization: opts.auth } : {}),
        },
        body: JSON.stringify(opts.body ?? {}),
      },
    );

  it("returns 401 without an Authorization header", async () => {
    const response = await POST(makeRequest({ auth: null }));
    expect(response.status).toBe(401);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong bearer token", async () => {
    const response = await POST(makeRequest({ auth: "Bearer wrong" }));
    expect(response.status).toBe(401);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("returns 200 with a valid token and forwards batchSize/tenantId", async () => {
    const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
    const response = await POST(
      makeRequest({
        auth: "Bearer super-secret",
        body: { batchSize: 10, tenantId },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockExpire).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 10, tenantId }),
    );
  });

  it("returns 422 for a non-UUID tenantId", async () => {
    const response = await POST(
      makeRequest({
        auth: "Bearer super-secret",
        body: { tenantId: "not-a-uuid" },
      }),
    );
    expect(response.status).toBe(422);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("returns 422 for a non-positive batchSize", async () => {
    const response = await POST(
      makeRequest({ auth: "Bearer super-secret", body: { batchSize: -3 } }),
    );
    expect(response.status).toBe(422);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("clamps batchSize to a maximum of 500", async () => {
    const response = await POST(
      makeRequest({ auth: "Bearer super-secret", body: { batchSize: 9999 } }),
    );
    expect(response.status).toBe(200);
    expect(mockExpire).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 500 }),
    );
  });
});
