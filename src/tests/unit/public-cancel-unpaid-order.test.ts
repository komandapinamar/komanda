import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock transaction
const mockTx = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_context, callback) => callback(mockTx)),
}));

// Mock repositories and services
const mockAppendTransitionEvent = vi.fn();
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: vi.fn().mockImplementation(function () {
    return {
      appendTransitionEvent: mockAppendTransitionEvent,
    };
  }),
}));

const mockMarkRedemptionCancelled = vi.fn();
vi.mock("@/features/discounts/infrastructure/discount.repository", () => ({
  DiscountRepository: vi.fn().mockImplementation(function () {
    return {
      markRedemptionCancelled: mockMarkRedemptionCancelled,
    };
  }),
}));

const mockAppendAuditEvent = vi.fn();
vi.mock("@/lib/audit/audit.service", () => ({
  appendAuditEvent: (...args: unknown[]) => mockAppendAuditEvent(...args),
}));

const mockAppendOutboxEvent = vi.fn();
vi.mock("@/lib/outbox/outbox.service", () => ({
  appendOutboxEvent: (...args: unknown[]) => mockAppendOutboxEvent(...args),
}));

import {
  cancelUnpaidOrderSchema,
  type CancelUnpaidOrderResponse,
} from "@/features/orders/domain/cancel-unpaid-order.schemas";
import {
  CancelUnpaidOrderService,
} from "@/features/orders/application/cancel-unpaid-order.service";
import {
  InvalidPickupPinError,
  OrderAlreadyPaidError,
  OrderConflictError,
  OrderNotFoundError,
} from "@/features/orders/application/order-errors";
import {
  POST,
  cancelUnpaidOrderErrorResponse,
} from "@/app/api/v1/public/orders/[tenantId]/[orderId]/cancel-unpaid/route";
import {
  PublicOrderStatus,
  type PublicOrderStatusData,
} from "@/features/orders/web/PublicOrderStatus";
import { restoreCartBackup } from "@/features/shop/cart/context/cart.context";

process.env.KOMANDA_PUBLIC_BASE_URL = "https://komanda.app";

describe("Story 1.3: Cancelación Voluntaria del Cliente con Preservación de Carrito", () => {
  const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
  const orderId = "62d47dd7-d84d-4313-87f1-d0e72dfafafe";
  const fixedNow = new Date("2026-10-05T13:45:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Domain & Schema: cancelUnpaidOrderSchema", () => {
    it("accepts a valid 4-digit numeric string", () => {
      const result = cancelUnpaidOrderSchema.safeParse({ pickupPin: "5821" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pickupPin).toBe("5821");
      }
    });

    it("accepts a valid 4-digit number and coerces it to string", () => {
      const result = cancelUnpaidOrderSchema.safeParse({ pickupPin: 5821 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pickupPin).toBe("5821");
      }
    });

    it("rejects non-4-digit strings", () => {
      expect(cancelUnpaidOrderSchema.safeParse({ pickupPin: "123" }).success).toBe(false);
      expect(cancelUnpaidOrderSchema.safeParse({ pickupPin: "12345" }).success).toBe(false);
      expect(cancelUnpaidOrderSchema.safeParse({ pickupPin: "abcd" }).success).toBe(false);
      expect(cancelUnpaidOrderSchema.safeParse({ pickupPin: "" }).success).toBe(false);
    });

    it("rejects unknown extra properties (strict)", () => {
      const result = cancelUnpaidOrderSchema.safeParse({
        pickupPin: "5821",
        extraField: "disallowed",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Application Service: CancelUnpaidOrderService", () => {
    const basePendingCashOrder = {
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
      discountSnapshot: null,
      updatedAt: fixedNow,
    };

    it("successfully cancels a pending cash order when PIN matches", async () => {
      const updatedOrder = {
        ...basePendingCashOrder,
        fulfillmentStatus: "cancelled",
        version: 2,
        updatedAt: fixedNow,
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [basePendingCashOrder],
          }),
        }),
      });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [updatedOrder],
          }),
        }),
      });

      const service = new CancelUnpaidOrderService(() => fixedNow);
      const result = await service.cancel({
        tenantId,
        orderId,
        body: { pickupPin: "5821" },
        correlationId: "corr-123",
      });

      expect(result).toEqual<CancelUnpaidOrderResponse>({
        orderId,
        fulfillmentStatus: "cancelled",
        paymentStatus: "pending",
        cancelledAt: fixedNow.toISOString(),
      });

      // Verify audit event is recorded with unpaid_cash_cancelled reason
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
            reason: "unpaid_cash_cancelled",
          }),
        }),
      );

      // Verify outbox event is recorded
      expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ tenantId }),
        expect.objectContaining({
          aggregateId: orderId,
          eventType: "order.transitioned",
          payload: expect.objectContaining({
            toStatus: "cancelled",
            reason: "unpaid_cash_cancelled",
          }),
        }),
      );

      // Verify order repository transition event was logged
      expect(mockAppendTransitionEvent).toHaveBeenCalledWith({
        orderId,
        fromStatus: "approved",
        toStatus: "cancelled",
      });
    });

    it("marks coupon redemption cancelled when order had a discount snapshot", async () => {
      const orderWithDiscount = {
        ...basePendingCashOrder,
        discountSnapshot: {
          discountId: "disc-00000000-0000-4000-8000-000000000001",
          code: "PROMO10",
        },
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [orderWithDiscount],
          }),
        }),
      });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [{ ...orderWithDiscount, fulfillmentStatus: "cancelled" }],
          }),
        }),
      });

      const service = new CancelUnpaidOrderService(() => fixedNow);
      await service.cancel({
        tenantId,
        orderId,
        body: { pickupPin: "5821" },
      });

      expect(mockMarkRedemptionCancelled).toHaveBeenCalledWith(orderId);
    });

    it("is idempotent: returns 200 without re-updating when order is already cancelled", async () => {
      const alreadyCancelledOrder = {
        ...basePendingCashOrder,
        fulfillmentStatus: "cancelled",
        updatedAt: fixedNow,
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [alreadyCancelledOrder],
          }),
        }),
      });

      const service = new CancelUnpaidOrderService(() => fixedNow);
      const result = await service.cancel({
        tenantId,
        orderId,
        body: { pickupPin: "5821" },
      });

      expect(result.fulfillmentStatus).toBe("cancelled");
      expect(result.orderId).toBe(orderId);
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockAppendAuditEvent).not.toHaveBeenCalled();
    });

    it("already-cancelled order returns 200 even with a wrong PIN (no PIN oracle)", async () => {
      const alreadyCancelledOrder = {
        ...basePendingCashOrder,
        fulfillmentStatus: "cancelled",
        updatedAt: fixedNow,
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [alreadyCancelledOrder],
          }),
        }),
      });

      const service = new CancelUnpaidOrderService(() => fixedNow);
      const result = await service.cancel({
        tenantId,
        orderId,
        body: { pickupPin: "0000" },
      });

      expect(result.fulfillmentStatus).toBe("cancelled");
    });

    it("throws OrderAlreadyPaidError (409) if the order was already paid in POS", async () => {
      const paidOrder = {
        ...basePendingCashOrder,
        paymentStatus: "paid",
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [paidOrder],
          }),
        }),
      });

      const service = new CancelUnpaidOrderService(() => fixedNow);
      await expect(
        service.cancel({
          tenantId,
          orderId,
          body: { pickupPin: "5821" },
        }),
      ).rejects.toThrow(OrderAlreadyPaidError);
    });

    it("throws InvalidPickupPinError (422) if pickup PIN does not match", async () => {
      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [basePendingCashOrder],
          }),
        }),
      });

      const service = new CancelUnpaidOrderService(() => fixedNow);
      await expect(
        service.cancel({
          tenantId,
          orderId,
          body: { pickupPin: "9999" },
        }),
      ).rejects.toThrow(InvalidPickupPinError);
    });

    it("throws OrderNotFoundError (404) if order is not found", async () => {
      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      });

      const service = new CancelUnpaidOrderService(() => fixedNow);
      await expect(
        service.cancel({
          tenantId,
          orderId,
          body: { pickupPin: "5821" },
        }),
      ).rejects.toThrow(OrderNotFoundError);
    });

    it("throws OrderNotFoundError (404) if tenantId or orderId is not a valid UUID", async () => {
      const service = new CancelUnpaidOrderService(() => fixedNow);
      await expect(
        service.cancel({
          tenantId: "not-a-uuid",
          orderId,
          body: { pickupPin: "5821" },
        }),
      ).rejects.toThrow(OrderNotFoundError);
    });

    it("throws OrderConflictError (409) if tender is not cash", async () => {
      const posnetOrder = {
        ...basePendingCashOrder,
        tender: "posnet",
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [posnetOrder],
          }),
        }),
      });

      const service = new CancelUnpaidOrderService(() => fixedNow);
      await expect(
        service.cancel({
          tenantId,
          orderId,
          body: { pickupPin: "5821" },
        }),
      ).rejects.toThrow(OrderConflictError);
    });
  });

  describe("HTTP Route: POST /api/v1/public/orders/[tenantId]/[orderId]/cancel-unpaid", () => {
    const route = (t: string, o: string) => ({
      params: Promise.resolve({ tenantId: t, orderId: o }),
    });

    it("returns 200 with envelope on successful cancellation", async () => {
      const pendingOrder = {
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
        discountSnapshot: null,
        updatedAt: fixedNow,
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [pendingOrder],
          }),
        }),
      });

      mockTx.update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [{ ...pendingOrder, fulfillmentStatus: "cancelled" }],
          }),
        }),
      });

      const req = new Request("https://komanda.app/api/v1/public/orders/cancel-unpaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupPin: "5821" }),
      });

      const response = await POST(req, route(tenantId, orderId));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-Correlation-Id")).toBeDefined();

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        orderId,
        fulfillmentStatus: "cancelled",
        paymentStatus: "pending",
      });
    });

    it("returns 404 RESOURCE_NOT_FOUND without DB query for malformed UUIDs", async () => {
      const req = new Request("https://komanda.app/api/v1/public/orders/cancel-unpaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupPin: "5821" }),
      });

      const response = await POST(req, route("bad-tenant", orderId));
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe("RESOURCE_NOT_FOUND");
      expect(mockTx.select).not.toHaveBeenCalled();
    });

    it("returns 409 ORDER_ALREADY_PAID when order has already been paid", async () => {
      const paidOrder = {
        id: orderId,
        tenantId,
        purchaseNumber: BigInt("1084"),
        source: "storefront_cash",
        paymentStatus: "paid",
        fulfillmentStatus: "approved",
        tender: "cash",
        pickupPin: "5821",
        version: 1,
        total: "4500.00",
        discountSnapshot: null,
        updatedAt: fixedNow,
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [paidOrder],
          }),
        }),
      });

      const req = new Request("https://komanda.app/api/v1/public/orders/cancel-unpaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupPin: "5821" }),
      });

      const response = await POST(req, route(tenantId, orderId));
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe("ORDER_ALREADY_PAID");
    });

    it("returns 422 INVALID_PICKUP_PIN when PIN is incorrect", async () => {
      const pendingOrder = {
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
        discountSnapshot: null,
        updatedAt: fixedNow,
      };

      mockTx.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [pendingOrder],
          }),
        }),
      });

      const req = new Request("https://komanda.app/api/v1/public/orders/cancel-unpaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupPin: "1111" }),
      });

      const response = await POST(req, route(tenantId, orderId));
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("INVALID_PICKUP_PIN");
    });

    it("returns 422 VALIDATION_FAILED when payload has invalid PIN format", async () => {
      const req = new Request("https://komanda.app/api/v1/public/orders/cancel-unpaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupPin: "invalid-pin" }),
      });

      const response = await POST(req, route(tenantId, orderId));
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("Cart Backup & Restoration: restoreCartBackup()", () => {
    const slug = "test-restaurant";
    const backupKey = `komanda.cart.backup.${slug}`;
    const primaryKey = `komanda.cart.${slug}`;

    class MockLocalStorage {
      private store: Map<string, string> = new Map();

      getItem(key: string): string | null {
        return this.store.get(key) ?? null;
      }

      setItem(key: string, value: string): void {
        this.store.set(key, String(value));
      }

      removeItem(key: string): void {
        this.store.delete(key);
      }

      clear(): void {
        this.store.clear();
      }

      get length(): number {
        return this.store.size;
      }

      key(index: number): string | null {
        const keys = Array.from(this.store.keys());
        return keys[index] ?? null;
      }
    }

    let mockStorage: MockLocalStorage;

    beforeEach(() => {
      mockStorage = new MockLocalStorage();
      (globalThis as unknown as { window: unknown }).window = {
        localStorage: mockStorage,
      };
    });

    afterEach(() => {
      delete (globalThis as unknown as { window?: unknown }).window;
    });

    it("restores cart snapshot from backup key to primary storage key", () => {
      const mockState = {
        cartId: "cart-123",
        items: [
          {
            quantity: 2,
            item: {
              documentId: "item-1",
              name: "Hamburguesa",
              price: 2500,
            },
          },
        ],
        appliedDiscount: null,
        discountTotal: 0,
      };

      window.localStorage.setItem(backupKey, JSON.stringify(mockState));

      const success = restoreCartBackup(slug);
      expect(success).toBe(true);

      const restored = window.localStorage.getItem(primaryKey);
      expect(restored).not.toBeNull();
      expect(JSON.parse(restored!)).toEqual({ ...mockState, cartId: null });
      // Backup key should be cleared after restoration
      expect(window.localStorage.getItem(backupKey)).toBeNull();
    });

    it("finds any backup key if slug is not explicitly provided", () => {
      const mockState = {
        cartId: "cart-999",
        items: [
          {
            quantity: 1,
            item: { documentId: "item-2", name: "Papas Fritas", price: 1200 },
          },
        ],
      };

      window.localStorage.setItem(backupKey, JSON.stringify(mockState));

      const success = restoreCartBackup();
      expect(success).toBe(true);
      expect(JSON.parse(window.localStorage.getItem(primaryKey)!)).toEqual({
        ...mockState,
        cartId: null,
      });
      expect(window.localStorage.getItem(backupKey)).toBeNull();
    });

    it("returns false if no backup key exists in localStorage", () => {
      const success = restoreCartBackup(slug);
      expect(success).toBe(false);
    });

    it("without slug, restores the most recently saved backup (newest-wins)", () => {
      const otherSlug = "otro-resto";
      const otherBackupKey = `komanda.cart.backup.${otherSlug}`;
      const otherPrimaryKey = `komanda.cart.${otherSlug}`;

      const olderState = {
        cartId: "cart-old",
        savedAt: 1000,
        items: [
          { quantity: 1, item: { documentId: "item-old", name: "Viejo", price: 100 } },
        ],
      };
      const newerState = {
        cartId: "cart-new",
        savedAt: 5000,
        items: [
          { quantity: 1, item: { documentId: "item-new", name: "Nuevo", price: 200 } },
        ],
      };

      window.localStorage.setItem(backupKey, JSON.stringify(olderState));
      window.localStorage.setItem(otherBackupKey, JSON.stringify(newerState));

      const success = restoreCartBackup();
      expect(success).toBe(true);

      // El más reciente (otherSlug) gana; el viejo permanece intacto.
      expect(window.localStorage.getItem(otherPrimaryKey)).not.toBeNull();
      expect(window.localStorage.getItem(backupKey)).not.toBeNull();
      expect(window.localStorage.getItem(otherBackupKey)).toBeNull();
    });

    it("without slug, ignores malformed backup payloads", () => {
      window.localStorage.setItem(backupKey, "not-json");
      const success = restoreCartBackup();
      expect(success).toBe(false);
    });
  });

  describe("UI Integration: PublicOrderStatus Cancel Button Gating", () => {
    it("renders 'Cancelar pedido' button in cash pending state", () => {
      const pendingCashOrder: PublicOrderStatusData = {
        purchaseNumber: "1084",
        fulfillmentStatus: "approved",
        paymentStatus: "pending",
        tender: "cash",
        paymentExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        pickupPin: "5821",
      };

      const html = renderToStaticMarkup(
        React.createElement(PublicOrderStatus, {
          tenantId,
          orderId,
          initialOrder: pendingCashOrder,
          initialPin: "5821",
        }),
      );

      expect(html).toContain("Cancelar pedido");
    });

    it("does not render 'Cancelar pedido' when order has been paid", () => {
      const paidOrder: PublicOrderStatusData = {
        purchaseNumber: "1084",
        fulfillmentStatus: "preparing",
        paymentStatus: "paid",
        tender: "cash",
        pickupPin: "5821",
      };

      const html = renderToStaticMarkup(
        React.createElement(PublicOrderStatus, {
          tenantId,
          orderId,
          initialOrder: paidOrder,
        }),
      );

      expect(html).not.toContain("Cancelar pedido");
    });

    it("does not render 'Cancelar pedido' when order is already cancelled", () => {
      const cancelledOrder: PublicOrderStatusData = {
        purchaseNumber: "1084",
        fulfillmentStatus: "cancelled",
        paymentStatus: "pending",
        tender: "cash",
      };

      const html = renderToStaticMarkup(
        React.createElement(PublicOrderStatus, {
          tenantId,
          orderId,
          initialOrder: cancelledOrder,
        }),
      );

      expect(html).not.toContain("Cancelar pedido");
    });
  });
});
