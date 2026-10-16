import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock transaction and DB
const {
  mockTx,
  mockDb,
  mockAppendTransitionEvent,
  mockMarkRedemptionCancelled,
  mockAppendAuditEvent,
  mockAppendOutboxEvent,
} = vi.hoisted(() => ({
  mockTx: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
  mockDb: {
    select: vi.fn(),
    execute: vi.fn(),
  },
  mockAppendTransitionEvent: vi.fn(),
  mockMarkRedemptionCancelled: vi.fn(),
  mockAppendAuditEvent: vi.fn(),
  mockAppendOutboxEvent: vi.fn(),
}));

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_context, callback) => callback(mockTx)),
  withPlatformServiceTransaction: vi.fn((_context, callback) => callback(mockDb)),
}));

vi.mock("@/db", () => ({
  db: mockDb,
  runtimePool: {},
}));

// Mock repositories and services
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: vi.fn().mockImplementation(function () {
    return {
      appendTransitionEvent: mockAppendTransitionEvent,
    };
  }),
}));

vi.mock("@/features/discounts/infrastructure/discount.repository", () => ({
  DiscountRepository: vi.fn().mockImplementation(function () {
    return {
      markRedemptionCancelled: mockMarkRedemptionCancelled,
    };
  }),
}));

vi.mock("@/lib/audit/audit.service", () => ({
  appendAuditEvent: (...args: unknown[]) => mockAppendAuditEvent(...args),
}));

vi.mock("@/lib/outbox/outbox.service", () => ({
  appendOutboxEvent: (...args: unknown[]) => mockAppendOutboxEvent(...args),
}));

import {
  expireUnpaidCashOrders,
  ExpireUnpaidOrdersJob,
  buildExpireCandidatesQuery,
  type ExpireUnpaidCashOrdersResult,
} from "@/features/orders/application/expire-unpaid-orders.job";
import { POST } from "@/app/api/v1/internal/cron/expire-unpaid-cash-orders/route";
import { runExpireUnpaidCashOrdersScript } from "@/scripts/expire-unpaid-cash-orders";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

describe("Story 1.4: Tarea Programada de Expiración Automática TTL 60m para Storefront", () => {
  const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
  const orderId = "62d47dd7-d84d-4313-87f1-d0e72dfafafe";
  const fixedNow = new Date("2026-10-05T14:00:00.000Z");
  const pastExpiresAt = new Date("2026-10-05T13:50:00.000Z"); // expired 10 minutes ago
  const futureExpiresAt = new Date("2026-10-05T14:30:00.000Z"); // 30 minutes in future

  const baseExpiredCashOrder = {
    id: orderId,
    tenantId,
    purchaseNumber: BigInt("1084"),
    source: "storefront_cash",
    paymentStatus: "pending",
    fulfillmentStatus: "approved",
    tender: "cash",
    pickupPin: "5821",
    version: 1,
    total: "4500.00",
    paymentExpiresAt: pastExpiresAt,
    discountSnapshot: null,
    updatedAt: pastExpiresAt,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret-123";
  });

  function setupMockCandidates(candidates: Array<{ id: string; tenantId: string; version: number }>) {
    mockDb.select.mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => candidates,
          }),
          limit: async () => candidates,
        }),
      }),
    });
  }

  describe("SQL Candidate Query & Filters (buildExpireCandidatesQuery)", () => {
    it("builds SQL filtering strictly source='storefront_cash', payment_status='pending', fulfillment_status='approved', and payment_expires_at <= now", () => {
      const dummyPool = new Pool();
      const dummyDb = drizzle(dummyPool);
      const query = buildExpireCandidatesQuery(dummyDb as never, fixedNow, { batchSize: 25 });
      const sqlObj = query.toSQL();

      expect(sqlObj.sql).toContain('"orders"."source" = $1');
      expect(sqlObj.sql).toContain('"orders"."payment_status" = $2');
      expect(sqlObj.sql).toContain('"orders"."fulfillment_status" = $3');
      expect(sqlObj.sql).toContain('"orders"."payment_expires_at" is not null');
      expect(sqlObj.sql).toContain('"orders"."payment_expires_at" <= $4');
      expect(sqlObj.sql).toContain('order by "orders"."payment_expires_at" asc');
      expect(sqlObj.sql).toContain("limit $5");

      expect(sqlObj.params).toEqual([
        "storefront_cash",
        "pending",
        "approved",
        fixedNow.toISOString(),
        25,
      ]);
    });

    it("includes tenantId condition when provided in options", () => {
      const dummyPool = new Pool();
      const dummyDb = drizzle(dummyPool);
      const query = buildExpireCandidatesQuery(dummyDb as never, fixedNow, {
        batchSize: 50,
        tenantId,
      });
      const sqlObj = query.toSQL();

      expect(sqlObj.sql).toContain('"orders"."tenant_id" = $5');
      expect(sqlObj.params).toEqual([
        "storefront_cash",
        "pending",
        "approved",
        fixedNow.toISOString(),
        tenantId,
        50,
      ]);
    });
  });

  describe("Application Service: expireUnpaidCashOrders", () => {
    it("expires an eligible storefront_cash order whose TTL has passed", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [baseExpiredCashOrder],
          }),
        }),
      });

      let capturedSetPayload: Record<string, unknown> | null = null;
      mockTx.update.mockReturnValue({
        set: (payload: Record<string, unknown>) => {
          capturedSetPayload = payload;
          return {
            where: () => ({
              returning: async () => [{ ...baseExpiredCashOrder, fulfillmentStatus: "cancelled", version: 2 }],
            }),
          };
        },
      });

      const result = await expireUnpaidCashOrders({
        now: () => fixedNow,
      });

      expect(result).toEqual<ExpireUnpaidCashOrdersResult>({
        expiredCount: 1,
        expiredOrderIds: [orderId],
      });

      // El pago debe quedar en estado terminal para no reportarse como pendiente
      expect(capturedSetPayload).toMatchObject({
        fulfillmentStatus: "cancelled",
        paymentStatus: "failed",
      });

      // Verify audit event is recorded with unpaid_cash_expired reason
      expect(mockAppendAuditEvent).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ tenantId }),
        expect.objectContaining({
          action: "order.transition",
          resourceId: orderId,
          outcome: "allowed",
          metadata: expect.objectContaining({
            fromStatus: "approved",
            toStatus: "cancelled",
            reason: "unpaid_cash_expired",
          }),
        }),
      );

      // Verify outbox event is enqueued with unpaid_cash_expired reason
      expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ tenantId }),
        expect.objectContaining({
          aggregateId: orderId,
          eventType: "order.transitioned",
          payload: expect.objectContaining({
            orderId,
            toStatus: "cancelled",
            reason: "unpaid_cash_expired",
            paymentStatus: "pending",
          }),
        }),
      );

      // Verify transition event is logged
      expect(mockAppendTransitionEvent).toHaveBeenCalledWith({
        orderId,
        fromStatus: "approved",
        toStatus: "cancelled",
      });
    });

    it("reverts coupon redemption when the expired order had a discount applied", async () => {
      const orderWithCoupon = {
        ...baseExpiredCashOrder,
        discountSnapshot: {
          discountId: "disc-00000000-0000-4000-8000-000000000001",
          code: "PROMO10",
          amountDeducted: "500.00",
        },
      };

      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [orderWithCoupon],
          }),
        }),
      });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [{ ...orderWithCoupon, fulfillmentStatus: "cancelled" }],
          }),
        }),
      });

      await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(mockMarkRedemptionCancelled).toHaveBeenCalledWith(orderId);
    });

    it("does not call markRedemptionCancelled if the order had no discount", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [baseExpiredCashOrder],
          }),
        }),
      });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [{ ...baseExpiredCashOrder, fulfillmentStatus: "cancelled" }],
          }),
        }),
      });

      await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(mockMarkRedemptionCancelled).not.toHaveBeenCalled();
    });

    it("handles multiple expired orders across distinct tenants in batch", async () => {
      const tenant2 = "22222222-2222-4222-8222-222222222222";
      const order2 = "77777777-7777-4777-8777-777777777777";

      setupMockCandidates([
        { id: orderId, tenantId, version: 1 },
        { id: order2, tenantId: tenant2, version: 1 },
      ]);

      mockTx.select
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: async () => [baseExpiredCashOrder],
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  ...baseExpiredCashOrder,
                  id: order2,
                  tenantId: tenant2,
                },
              ],
            }),
          }),
        });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [{ fulfillmentStatus: "cancelled" }],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(2);
      expect(result.expiredOrderIds).toEqual([orderId, order2]);
      expect(mockAppendAuditEvent).toHaveBeenCalledTimes(2);
      expect(mockAppendOutboxEvent).toHaveBeenCalledTimes(2);
    });

    it("returns zero expired orders without writes when no candidate orders exist", async () => {
      setupMockCandidates([]);

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result).toEqual<ExpireUnpaidCashOrdersResult>({
        expiredCount: 0,
        expiredOrderIds: [],
      });
      expect(mockTx.select).not.toHaveBeenCalled();
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockAppendAuditEvent).not.toHaveBeenCalled();
    });

    it("is idempotent: skips orders that are already cancelled", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      const alreadyCancelledOrder = {
        ...baseExpiredCashOrder,
        fulfillmentStatus: "cancelled",
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [alreadyCancelledOrder],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(0);
      expect(result.expiredOrderIds).toEqual([]);
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockAppendAuditEvent).not.toHaveBeenCalled();
    });

    it("never cancels storefront orders that were already paid in POS (cobro confirmado prevalece)", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      const paidOrder = {
        ...baseExpiredCashOrder,
        paymentStatus: "paid",
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [paidOrder],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(0);
      expect(result.expiredOrderIds).toEqual([]);
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockAppendAuditEvent).not.toHaveBeenCalled();
    });

    it("never cancels orders from admin_direct (mostrador) or komanda-kiosk (Invariante AD-2)", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      const kioskOrAdminOrder = {
        ...baseExpiredCashOrder,
        source: "admin_direct",
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [kioskOrAdminOrder],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(0);
      expect(result.expiredOrderIds).toEqual([]);
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockAppendAuditEvent).not.toHaveBeenCalled();
    });

    it("skips orders whose paymentExpiresAt has not passed yet", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      const unexpiredOrder = {
        ...baseExpiredCashOrder,
        paymentExpiresAt: futureExpiresAt,
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [unexpiredOrder],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(0);
      expect(result.expiredOrderIds).toEqual([]);
      expect(mockTx.update).not.toHaveBeenCalled();
    });

    it("skips orders whose paymentExpiresAt is null", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      const nullTtlOrder = {
        ...baseExpiredCashOrder,
        paymentExpiresAt: null,
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [nullTtlOrder],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(0);
      expect(result.expiredOrderIds).toEqual([]);
      expect(mockTx.update).not.toHaveBeenCalled();
    });

    it("skips orders with non-approved fulfillmentStatus (preparing, ready, delivered)", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      const preparingOrder = {
        ...baseExpiredCashOrder,
        fulfillmentStatus: "preparing",
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [preparingOrder],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(0);
      expect(result.expiredOrderIds).toEqual([]);
      expect(mockTx.update).not.toHaveBeenCalled();
    });

    it("skips orders with non-pending paymentStatus (failed, refunded)", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      const refundedOrder = {
        ...baseExpiredCashOrder,
        paymentStatus: "refunded",
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [refundedOrder],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(0);
      expect(result.expiredOrderIds).toEqual([]);
      expect(mockTx.update).not.toHaveBeenCalled();
    });

    it("handles concurrent updates gracefully when optimistic lock detects conflict", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [baseExpiredCashOrder],
          }),
        }),
      });

      // Returning empty array simulates concurrent version change
      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      });

      const result = await expireUnpaidCashOrders({ now: () => fixedNow });

      expect(result.expiredCount).toBe(0);
      expect(result.expiredOrderIds).toEqual([]);
      expect(mockAppendAuditEvent).not.toHaveBeenCalled();
    });

    it("ExpireUnpaidOrdersJob class invokes expireUnpaidCashOrders correctly", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [baseExpiredCashOrder],
          }),
        }),
      });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [{ ...baseExpiredCashOrder, fulfillmentStatus: "cancelled" }],
          }),
        }),
      });

      const job = new ExpireUnpaidOrdersJob({ now: () => fixedNow });
      const result = await job.run();

      expect(result.expiredCount).toBe(1);
      expect(result.expiredOrderIds).toEqual([orderId]);
    });
  });

  describe("Internal Cron Route: POST /api/v1/internal/cron/expire-unpaid-cash-orders", () => {
    it("returns HTTP 401 Unauthorized when Authorization header is missing", async () => {
      const request = new Request("https://komanda.app/api/v1/internal/cron/expire-unpaid-cash-orders", {
        method: "POST",
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.code).toBe("UNAUTHORIZED");
      expect(body.title).toBe("Unauthorized");
    });

    it("returns HTTP 401 Unauthorized when Bearer token is invalid", async () => {
      const request = new Request("https://komanda.app/api/v1/internal/cron/expire-unpaid-cash-orders", {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid-token",
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("returns HTTP 401 Unauthorized when CRON_SECRET is not configured", async () => {
      delete process.env.CRON_SECRET;

      const request = new Request("https://komanda.app/api/v1/internal/cron/expire-unpaid-cash-orders", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret-123",
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("returns HTTP 200 with result envelope when valid Bearer token is provided", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [baseExpiredCashOrder],
          }),
        }),
      });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [{ ...baseExpiredCashOrder, fulfillmentStatus: "cancelled" }],
          }),
        }),
      });

      const request = new Request("https://komanda.app/api/v1/internal/cron/expire-unpaid-cash-orders", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batchSize: 10, tenantId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-Correlation-Id")).toBeDefined();

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.error).toBeNull();
      expect(body.data).toEqual({
        expiredCount: 1,
        expiredOrderIds: [orderId],
      });
    });
  });

  describe("CLI Script: runExpireUnpaidCashOrdersScript", () => {
    it("runs the expiration job and logs to stdout", async () => {
      setupMockCandidates([{ id: orderId, tenantId, version: 1 }]);

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [baseExpiredCashOrder],
          }),
        }),
      });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [{ ...baseExpiredCashOrder, fulfillmentStatus: "cancelled" }],
          }),
        }),
      });

      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const result = await runExpireUnpaidCashOrdersScript();

      expect(result.expiredCount).toBe(1);
      expect(result.expiredOrderIds).toEqual([orderId]);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("[expire-unpaid-cash-orders] Expired 1 order(s)"),
      );

      stdoutSpy.mockRestore();
    });
  });
});
