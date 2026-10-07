import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatRemainingTime,
  PublicOrderStatus,
  type PublicOrderStatusData,
} from "@/features/orders/web/PublicOrderStatus";
import { createCashOrder } from "@/features/shop/payments/cash-order.client";

const { withTenantIdTransaction } = vi.hoisted(() => ({
  withTenantIdTransaction: vi.fn(),
}));
vi.mock("@/db/tenant-transaction", () => ({ withTenantIdTransaction }));

import { GET } from "@/app/api/v1/public/orders/[tenantId]/[orderId]/status/route";

const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
const orderId = "62d47dd7-d84d-4313-87f1-d0e72dfafafe";
const request = new Request("https://komanda.example/api/v1/public/orders/status");
const route = (tenant: string, order: string) => ({
  params: Promise.resolve({ tenantId: tenant, orderId: order }),
});

describe("Story 1.2: Storefront Cash Status UI & Enriched Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("GET /api/v1/public/orders/:tenantId/:orderId/status enriched response", () => {
    it("returns paymentStatus, tender and paymentExpiresAt (ISO format) for cash order", async () => {
      const fixedExpiresAt = new Date("2026-10-05T13:00:00.000Z");

      withTenantIdTransaction.mockImplementation(async (_ctx, callback) =>
        callback({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [
                  {
                    purchaseNumber: BigInt("1084"),
                    fulfillmentStatus: "approved",
                    paymentStatus: "pending",
                    tender: "cash",
                    paymentExpiresAt: fixedExpiresAt,
                  },
                ],
              }),
            }),
          }),
        }),
      );

      const response = await GET(request, route(tenantId, orderId));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");

      const body = await response.json();
      expect(body).toEqual({
        purchaseNumber: "1084",
        fulfillmentStatus: "approved",
        paymentStatus: "pending",
        tender: "cash",
        paymentExpiresAt: "2026-10-05T13:00:00.000Z",
      });
    });

    it("returns paymentStatus 'paid' when counter confirms payment", async () => {
      const fixedExpiresAt = new Date("2026-10-05T13:00:00.000Z");

      withTenantIdTransaction.mockImplementation(async (_ctx, callback) =>
        callback({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [
                  {
                    purchaseNumber: BigInt("1084"),
                    fulfillmentStatus: "preparing",
                    paymentStatus: "paid",
                    tender: "cash",
                    paymentExpiresAt: fixedExpiresAt,
                  },
                ],
              }),
            }),
          }),
        }),
      );

      const response = await GET(request, route(tenantId, orderId));
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toEqual({
        purchaseNumber: "1084",
        fulfillmentStatus: "preparing",
        paymentStatus: "paid",
        tender: "cash",
        paymentExpiresAt: "2026-10-05T13:00:00.000Z",
      });
    });

    it("returns null for optional cash fields on standard/unpaid digital orders", async () => {
      withTenantIdTransaction.mockImplementation(async (_ctx, callback) =>
        callback({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [
                  {
                    purchaseNumber: BigInt("42"),
                    fulfillmentStatus: "approved",
                    paymentStatus: null,
                    tender: null,
                    paymentExpiresAt: null,
                  },
                ],
              }),
            }),
          }),
        }),
      );

      const response = await GET(request, route(tenantId, orderId));
      const body = await response.json();
      expect(body).toEqual({
        purchaseNumber: "42",
        fulfillmentStatus: "approved",
        paymentStatus: null,
        tender: null,
        paymentExpiresAt: null,
      });
    });

    it("rejects invalid UUID parameters with 404", async () => {
      const response = await GET(request, route("invalid-tenant", orderId));
      expect(response.status).toBe(404);
      expect(withTenantIdTransaction).not.toHaveBeenCalled();
    });

    it("returns 404 when order is not found in tenant", async () => {
      withTenantIdTransaction.mockImplementation(async (_ctx, callback) =>
        callback({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [],
              }),
            }),
          }),
        }),
      );

      const response = await GET(request, route(tenantId, orderId));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Order not found" });
    });
  });

  describe("createCashOrder client helper", () => {
    it("successfully sends POST with idempotency key and parses response", async () => {
      const mockOrderResponse = {
        orderId: "ord-1234",
        tenantId: "tenant-1234",
        purchaseNumber: "1084",
        pickupPin: "7428",
        total: "3500.00",
        paymentStatus: "pending",
        expiresAt: "2026-10-05T13:00:00.000Z",
        secondsRemaining: 3600,
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrderResponse,
      } as Response);

      const result = await createCashOrder("burger-joint", {
        cartId: "cart-abc",
        cartVersion: 2,
        customer: { name: "  Luka Modric  ", phone: "  1123456789  " },
        notes: "  Sin mayonesa  ",
        idempotencyKey: "fixed-idempotency-key",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/storefronts/burger-joint/carts/cart-abc/cash-orders",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "fixed-idempotency-key",
          },
          body: JSON.stringify({
            customer: {
              name: "Luka Modric",
              phone: "1123456789",
            },
            notes: "Sin mayonesa",
            cartVersion: 2,
          }),
        }),
      );

      expect(result).toEqual(mockOrderResponse);
    });

    it("throws descriptive error when server returns error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          code: "ORDERING_NOT_SUPPORTED",
          detail: "El comercio opera en modo autoservicio presencial.",
        }),
      } as Response);

      await expect(
        createCashOrder("burger-joint", {
          cartId: "cart-abc",
          customer: { name: "Luka" },
        }),
      ).rejects.toThrow("El comercio opera en modo autoservicio presencial.");
    });
  });

  describe("Timer countdown formatting (formatRemainingTime)", () => {
    const fixedNow = new Date("2026-10-05T12:00:00.000Z").getTime();

    it("formats 60 minutes remaining accurately to 60:00", () => {
      const expiresAt = new Date("2026-10-05T13:00:00.000Z");
      const { formatted, isExpired, remainingSeconds } = formatRemainingTime(
        expiresAt,
        fixedNow,
      );

      expect(formatted).toBe("60:00");
      expect(isExpired).toBe(false);
      expect(remainingSeconds).toBe(3600);
    });

    it("formats minutes and seconds with padding (e.g., 05:08)", () => {
      // 5 min 8 sec = 308 seconds
      const expiresAt = new Date(fixedNow + 308 * 1000);
      const { formatted, isExpired, remainingSeconds } = formatRemainingTime(
        expiresAt,
        fixedNow,
      );

      expect(formatted).toBe("05:08");
      expect(isExpired).toBe(false);
      expect(remainingSeconds).toBe(308);
    });

    it("detects expired timer when now >= expiresAt", () => {
      const expiresAt = new Date(fixedNow - 1000);
      const { formatted, isExpired, remainingSeconds } = formatRemainingTime(
        expiresAt,
        fixedNow,
      );

      expect(formatted).toBe("00:00");
      expect(isExpired).toBe(true);
      expect(remainingSeconds).toBe(0);
    });

    it("handles null or undefined expiresAt gracefully", () => {
      expect(formatRemainingTime(null, fixedNow)).toEqual({
        formatted: "00:00",
        isExpired: false,
        remainingSeconds: 0,
      });
      expect(formatRemainingTime(undefined, fixedNow)).toEqual({
        formatted: "00:00",
        isExpired: false,
        remainingSeconds: 0,
      });
    });
  });

  describe("UI & State Gating Invariants", () => {
    it("renders pending cash card with PIN, warning, and suppresses 'Cocina preparando'", () => {
      const pendingCashOrder: PublicOrderStatusData = {
        purchaseNumber: "1084",
        fulfillmentStatus: "preparing",
        paymentStatus: "pending",
        tender: "cash",
        paymentExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        pickupPin: "7428",
      };

      const html = renderToStaticMarkup(
        React.createElement(PublicOrderStatus, {
          tenantId,
          orderId,
          initialOrder: pendingCashOrder,
          initialPin: "7428",
        }),
      );

      expect(html).toContain("PIN DE COBRO EN CAJA");
      expect(html).toContain("7428");
      expect(html).toContain(
        "Acercate a la caja para abonar. Tu pedido comenzará a prepararse únicamente una vez confirmado el pago.",
      );
      expect(html).not.toContain("Cocina preparando");
      expect(html).not.toContain("¡Pago acreditado!");
    });

    it("renders paid confirmation and enables preparing when paymentStatus is 'paid'", () => {
      const paidOrder: PublicOrderStatusData = {
        purchaseNumber: "1084",
        fulfillmentStatus: "preparing",
        paymentStatus: "paid",
        tender: "cash",
        paymentExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        pickupPin: "7428",
      };

      const html = renderToStaticMarkup(
        React.createElement(PublicOrderStatus, {
          tenantId,
          orderId,
          initialOrder: paidOrder,
        }),
      );

      expect(html).toContain("¡Pago acreditado! Tu pedido ya está en preparación");
      expect(html).toContain("Cocina preparando");
      expect(html).not.toContain("PIN DE COBRO EN CAJA");
      expect(html).not.toContain("Acercate a la caja para abonar");
    });

    it("renders expired warning when countdown reaches 0", () => {
      const expiredOrder: PublicOrderStatusData = {
        purchaseNumber: "1084",
        fulfillmentStatus: "approved",
        paymentStatus: "pending",
        tender: "cash",
        paymentExpiresAt: new Date(Date.now() - 5000).toISOString(),
        pickupPin: "7428",
      };

      const html = renderToStaticMarkup(
        React.createElement(PublicOrderStatus, {
          tenantId,
          orderId,
          initialOrder: expiredOrder,
          initialPin: "7428",
        }),
      );

      expect(html).toContain("Tiempo de pago expirado");
      expect(html).toContain("El tiempo límite para abonar este pedido en caja ha expirado.");
    });
  });
});
