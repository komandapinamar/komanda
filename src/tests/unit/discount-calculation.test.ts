import { describe, expect, it } from "vitest";
import {
  calculateDiscountAmounts,
  evaluateCouponEligibility,
  prorateLineDiscounts,
  type CartLineForDiscount,
  type CouponRuleInput,
} from "@/features/discounts/domain/discount.rules";

describe("Story 2.1: Domain Math & Discount Rules", () => {
  const baseLines: CartLineForDiscount[] = [
    {
      id: "line-1",
      resourceId: "item-1",
      categoryId: "cat-burgers",
      quantity: 2,
      unitPriceCents: 300000, // $3.000
      lineTotalCents: 600000, // $6.000
    },
    {
      id: "line-2",
      resourceId: "item-2",
      categoryId: "cat-drinks",
      quantity: 1,
      unitPriceCents: 400000, // $4.000
      lineTotalCents: 400000, // $4.000
    },
  ];

  const now = new Date("2026-09-20T12:00:00Z");

  describe("Standard Percentage & Fixed Calculations", () => {
    it("computes 20% discount on global scope accurately", () => {
      const coupon: CouponRuleInput = {
        code: "PROMO20",
        discountType: "percentage",
        discountValue: "20.00",
        minOrderAmount: "0",
        scope: "global",
        isActive: true,
      };

      const result = calculateDiscountAmounts({ lines: baseLines, coupon, now });
      expect(result.isEligible).toBe(true);
      expect(result.subtotal).toBe("10000.00");
      expect(result.discountTotal).toBe("2000.00");
      expect(result.total).toBe("8000.00");
      expect(result.subtotalCents - result.discountTotalCents).toBe(result.totalCents);
    });

    it("applies half-up arithmetic rounding on periodic percentages", () => {
      const oddLines: CartLineForDiscount[] = [
        {
          id: "line-odd",
          quantity: 1,
          unitPriceCents: 633333, // $6.333,33
          lineTotalCents: 633333,
        },
      ];

      const coupon: CouponRuleInput = {
        code: "DESC15",
        discountType: "percentage",
        discountValue: "15.00",
        minOrderAmount: "0",
        scope: "global",
        isActive: true,
      };

      // 633333 * 0.15 = 94999.95 -> rounds to 95000 cents ($950.00)
      const result = calculateDiscountAmounts({ lines: oddLines, coupon, now });
      expect(result.isEligible).toBe(true);
      expect(result.subtotal).toBe("6333.33");
      expect(result.discountTotal).toBe("950.00");
      expect(result.total).toBe("5383.33");
      expect(result.subtotalCents - result.discountTotalCents).toBe(result.totalCents);
    });

    it("caps fixed discount to applicable subtotal and never returns negative total", () => {
      const smallLines: CartLineForDiscount[] = [
        {
          id: "line-small",
          quantity: 1,
          unitPriceCents: 320000, // $3.200
          lineTotalCents: 320000,
        },
      ];

      const coupon: CouponRuleInput = {
        code: "BIGFIXED",
        discountType: "fixed_amount",
        discountValue: "5000.00", // $5.000 > $3.200
        minOrderAmount: "0",
        scope: "global",
        isActive: true,
      };

      const result = calculateDiscountAmounts({ lines: smallLines, coupon, now });
      expect(result.isEligible).toBe(true);
      expect(result.subtotal).toBe("3200.00");
      expect(result.discountTotal).toBe("3200.00");
      expect(result.total).toBe("0.00");
      expect(result.totalCents).toBe(0);
    });
  });

  describe("Category and Item Scope Restrictions", () => {
    it("applies discount exclusively to items in target category", () => {
      const coupon: CouponRuleInput = {
        code: "BURGERS20",
        discountType: "percentage",
        discountValue: "20.00",
        minOrderAmount: "0",
        scope: "category",
        targetCategoryIds: ["cat-burgers"],
        isActive: true,
      };

      // Line 1 ($6.000) is cat-burgers. Line 2 ($4.000) is cat-drinks.
      // Applicable subtotal is $6.000. 20% of $6.000 is $1.200.
      const result = calculateDiscountAmounts({ lines: baseLines, coupon, now });
      expect(result.isEligible).toBe(true);
      expect(result.subtotal).toBe("10000.00");
      expect(result.discountTotal).toBe("1200.00");
      expect(result.total).toBe("8800.00");
      expect(result.qualifyingLineIds).toEqual(["line-1"]);
    });

    it("reports NO_QUALIFYING_ITEMS if cart has no items in target category", () => {
      const coupon: CouponRuleInput = {
        code: "PIZZA30",
        discountType: "percentage",
        discountValue: "30.00",
        minOrderAmount: "0",
        scope: "category",
        targetCategoryIds: ["cat-pizzas"], // not present in baseLines
        isActive: true,
      };

      const result = calculateDiscountAmounts({ lines: baseLines, coupon, now });
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("NO_QUALIFYING_ITEMS");
      expect(result.discountTotal).toBe("0.00");
      expect(result.total).toBe("10000.00");
    });
  });

  describe("Eligibility Rules Validation", () => {
    it("rejects when subtotal does not reach minOrderAmount", () => {
      const coupon: CouponRuleInput = {
        code: "MIN15K",
        discountType: "percentage",
        discountValue: "10.00",
        minOrderAmount: "15000.00", // Cart only has $10.000
        scope: "global",
        isActive: true,
      };

      const result = calculateDiscountAmounts({ lines: baseLines, coupon, now });
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("MIN_ORDER_NOT_MET");
    });

    it("rejects inactive coupon", () => {
      const coupon: CouponRuleInput = {
        code: "PAUSED",
        discountType: "percentage",
        discountValue: "10.00",
        minOrderAmount: "0",
        scope: "global",
        isActive: false,
      };

      const result = evaluateCouponEligibility(coupon, 1000000, now);
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("DISCOUNT_INACTIVE");
    });

    it("rejects scheduled coupon before startsAt", () => {
      const coupon: CouponRuleInput = {
        code: "FUTURE",
        discountType: "percentage",
        discountValue: "10.00",
        minOrderAmount: "0",
        startsAt: new Date("2026-10-01T00:00:00Z"),
        scope: "global",
        isActive: true,
      };

      const result = evaluateCouponEligibility(coupon, 1000000, now);
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("DISCOUNT_SCHEDULED");
    });

    it("rejects expired coupon after endsAt", () => {
      const coupon: CouponRuleInput = {
        code: "PAST",
        discountType: "percentage",
        discountValue: "10.00",
        minOrderAmount: "0",
        endsAt: new Date("2026-09-01T00:00:00Z"),
        scope: "global",
        isActive: true,
      };

      const result = evaluateCouponEligibility(coupon, 1000000, now);
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("DISCOUNT_EXPIRED");
    });

    it("rejects exhausted coupon when redemptions count reaches limit", () => {
      const coupon: CouponRuleInput = {
        code: "EXHAUSTED",
        discountType: "percentage",
        discountValue: "10.00",
        minOrderAmount: "0",
        maxRedemptions: 50,
        redemptionsCount: 50,
        scope: "global",
        isActive: true,
      };

      const result = evaluateCouponEligibility(coupon, 1000000, now);
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("DISCOUNT_LIMIT_REACHED");
    });
  });

  describe("Line-Level Discount Proration", () => {
    it("distributes discount among qualifying lines without penny drift", () => {
      const threeLines: CartLineForDiscount[] = [
        { id: "l1", quantity: 1, unitPriceCents: 333333, lineTotalCents: 333333 },
        { id: "l2", quantity: 1, unitPriceCents: 333333, lineTotalCents: 333333 },
        { id: "l3", quantity: 1, unitPriceCents: 333334, lineTotalCents: 333334 },
      ];
      const discountToAllocate = 100000; // $1.000

      const prorated = prorateLineDiscounts(threeLines, discountToAllocate);
      const totalAllocated = prorated.reduce((sum, p) => sum + p.lineDiscountCents, 0);

      expect(totalAllocated).toBe(discountToAllocate);
      expect(prorated[0].lineDiscountCents + prorated[1].lineDiscountCents + prorated[2].lineDiscountCents).toBe(100000);
    });
  });
});
