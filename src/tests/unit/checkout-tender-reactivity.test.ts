import { describe, expect, it } from "vitest";
import { normalizeCartResponse } from "@/features/shop/cart/services/cart.service";
import { computeDisplayTotals } from "@/app/(shop)/checkout/pay/page";
import type { OfficialCart } from "@/types/types";

function buildCart(overrides: Partial<OfficialCart> = {}): OfficialCart {
  return {
    id: "cart-1",
    currency: "ARS",
    items: [],
    subtotal: 10000,
    discountTotal: 2000,
    total: 8000,
    appliedDiscount: {
      code: "EFECTIVO10",
      name: "Promo Efectivo",
      discountType: "percentage",
      discountValue: "20.00",
      tenderRestriction: "cash",
    },
    ...overrides,
  };
}

describe("Story 4.3: Checkout tender reactivity", () => {
  describe("normalizeCartResponse tender marker", () => {
    it("propagates tenderRestriction from discountMetadata", () => {
      const cart = normalizeCartResponse({
        id: "cart-1",
        currency: "ARS",
        subtotal: "10000.00",
        discountTotal: "2000.00",
        total: "8000.00",
        discountMetadata: {
          code: "EFECTIVO10",
          name: "Promo Efectivo",
          discountType: "percentage",
          discountValue: "20.00",
          savingsAmount: "2000.00",
          tenderRestriction: "cash",
        },
      });

      expect(cart.appliedDiscount?.tenderRestriction).toBe("cash");
    });

    it("propagates tenderRestriction from appliedDiscount", () => {
      const cart = normalizeCartResponse({
        id: "cart-1",
        currency: "ARS",
        subtotal: "10000.00",
        discountTotal: "2000.00",
        total: "8000.00",
        appliedDiscount: {
          code: "EFECTIVO10",
          name: "Promo Efectivo",
          discountType: "percentage",
          discountValue: "20.00",
          tenderRestriction: "cash",
        },
      });

      expect(cart.appliedDiscount?.tenderRestriction).toBe("cash");
    });

    it("leaves tenderRestriction undefined for universal coupons", () => {
      const cart = normalizeCartResponse({
        id: "cart-1",
        currency: "ARS",
        subtotal: "10000.00",
        discountTotal: "2000.00",
        total: "8000.00",
        discountMetadata: {
          code: "UNIVERSAL10",
          name: "Promo Universal",
          discountType: "percentage",
          discountValue: "20.00",
          savingsAmount: "2000.00",
        },
      });

      expect(cart.appliedDiscount?.tenderRestriction).toBeUndefined();
    });
  });

  describe("computeDisplayTotals", () => {
    it("suppresses a cash-only coupon when paying with Mercado Pago", () => {
      const result = computeDisplayTotals(buildCart(), "mercadopago");

      expect(result.discountTotal).toBe(0);
      expect(result.total).toBe(10000);
      expect(result.suppressedCouponCode).toBe("EFECTIVO10");
    });

    it("restores the discount when switching back to cash", () => {
      const result = computeDisplayTotals(buildCart(), "cash");

      expect(result.discountTotal).toBe(2000);
      expect(result.total).toBe(8000);
      expect(result.suppressedCouponCode).toBeNull();
    });

    it("never suppresses a universal coupon on any tender", () => {
      const universalCart = buildCart({
        appliedDiscount: {
          code: "UNIVERSAL10",
          name: "Promo Universal",
          discountType: "percentage",
          discountValue: "20.00",
          tenderRestriction: "all",
        },
      });

      const withMp = computeDisplayTotals(universalCart, "mercadopago");
      const withCash = computeDisplayTotals(universalCart, "cash");

      expect(withMp.discountTotal).toBe(2000);
      expect(withMp.total).toBe(8000);
      expect(withMp.suppressedCouponCode).toBeNull();
      expect(withCash.discountTotal).toBe(2000);
      expect(withCash.total).toBe(8000);
      expect(withCash.suppressedCouponCode).toBeNull();
    });

    it("leaves the summary untouched when no coupon is applied", () => {
      const noDiscountCart = buildCart({
        discountTotal: 0,
        total: 10000,
        appliedDiscount: null,
      });

      const result = computeDisplayTotals(noDiscountCart, "mercadopago");

      expect(result.discountTotal).toBe(0);
      expect(result.total).toBe(10000);
      expect(result.suppressedCouponCode).toBeNull();
    });
  });
});
