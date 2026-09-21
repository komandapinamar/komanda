import { centsToMoney, moneyToCents } from "@/features/cart/domain/cart.rules";
import type { DiscountScope, DiscountType } from "@/db/schema/discounts";

export type IneligibilityReason =
  | "DISCOUNT_INACTIVE"
  | "DISCOUNT_SCHEDULED"
  | "DISCOUNT_EXPIRED"
  | "DISCOUNT_LIMIT_REACHED"
  | "MIN_ORDER_NOT_MET"
  | "NO_QUALIFYING_ITEMS";

export type CartLineForDiscount = {
  id: string;
  resourceId?: string | null;
  categoryId?: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type CouponRuleInput = {
  id?: string;
  code: string;
  discountType: DiscountType;
  discountValue: string;
  minOrderAmount: string;
  maxRedemptions?: number | null;
  redemptionsCount?: number;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  scope: DiscountScope;
  targetCategoryIds?: string[];
  targetItemIds?: string[];
  isActive: boolean;
};

export type DiscountEligibilityResult =
  | { isEligible: true; ineligibilityReason?: undefined }
  | { isEligible: false; ineligibilityReason: IneligibilityReason };

export type DiscountCalculationResult = {
  isEligible: boolean;
  ineligibilityReason?: IneligibilityReason;
  subtotal: string;
  subtotalCents: number;
  discountTotal: string;
  discountTotalCents: number;
  total: string;
  totalCents: number;
  applicableSubtotalCents: number;
  qualifyingLineIds: string[];
  lineDiscounts: Array<{
    lineId: string;
    lineDiscountCents: number;
    discountedLineTotalCents: number;
  }>;
};

export function evaluateCouponEligibility(
  coupon: CouponRuleInput,
  applicableSubtotalCents: number,
  now: Date = new Date(),
): DiscountEligibilityResult {
  if (!coupon.isActive) {
    return { isEligible: false, ineligibilityReason: "DISCOUNT_INACTIVE" };
  }

  if (coupon.startsAt) {
    const startsAtTime = new Date(coupon.startsAt).getTime();
    if (startsAtTime > now.getTime()) {
      return { isEligible: false, ineligibilityReason: "DISCOUNT_SCHEDULED" };
    }
  }

  if (coupon.endsAt) {
    const endsAtTime = new Date(coupon.endsAt).getTime();
    if (endsAtTime < now.getTime()) {
      return { isEligible: false, ineligibilityReason: "DISCOUNT_EXPIRED" };
    }
  }

  if (
    coupon.maxRedemptions !== null &&
    coupon.maxRedemptions !== undefined &&
    (coupon.redemptionsCount ?? 0) >= coupon.maxRedemptions
  ) {
    return {
      isEligible: false,
      ineligibilityReason: "DISCOUNT_LIMIT_REACHED",
    };
  }

  if (applicableSubtotalCents <= 0) {
    return { isEligible: false, ineligibilityReason: "NO_QUALIFYING_ITEMS" };
  }

  const minOrderCents = moneyToCents(coupon.minOrderAmount || "0");
  if (applicableSubtotalCents < minOrderCents) {
    return { isEligible: false, ineligibilityReason: "MIN_ORDER_NOT_MET" };
  }

  return { isEligible: true };
}

export function prorateLineDiscounts(
  qualifyingLines: CartLineForDiscount[],
  discountTotalCents: number,
): Array<{
  lineId: string;
  lineDiscountCents: number;
  discountedLineTotalCents: number;
}> {
  if (qualifyingLines.length === 0 || discountTotalCents <= 0) {
    return qualifyingLines.map((l) => ({
      lineId: l.id,
      lineDiscountCents: 0,
      discountedLineTotalCents: l.lineTotalCents,
    }));
  }

  const applicableSubtotalCents = qualifyingLines.reduce(
    (sum, line) => sum + line.lineTotalCents,
    0,
  );

  if (applicableSubtotalCents <= 0) {
    return qualifyingLines.map((l) => ({
      lineId: l.id,
      lineDiscountCents: 0,
      discountedLineTotalCents: 0,
    }));
  }

  let allocatedCents = 0;
  const results: Array<{
    lineId: string;
    lineDiscountCents: number;
    discountedLineTotalCents: number;
  }> = [];

  for (let i = 0; i < qualifyingLines.length; i++) {
    const line = qualifyingLines[i];
    const isLast = i === qualifyingLines.length - 1;

    let shareCents: number;
    if (isLast) {
      // Allocate remaining cents to prevent penny rounding drift
      shareCents = discountTotalCents - allocatedCents;
    } else {
      shareCents = Math.round(
        (line.lineTotalCents / applicableSubtotalCents) * discountTotalCents,
      );
    }

    // Ensure share doesn't exceed line total
    const boundedShare = Math.min(line.lineTotalCents, Math.max(0, shareCents));
    allocatedCents += boundedShare;

    results.push({
      lineId: line.id,
      lineDiscountCents: boundedShare,
      discountedLineTotalCents: line.lineTotalCents - boundedShare,
    });
  }

  return results;
}

export function calculateDiscountAmounts(params: {
  lines: CartLineForDiscount[];
  coupon: CouponRuleInput;
  now?: Date;
}): DiscountCalculationResult {
  const { lines, coupon, now = new Date() } = params;

  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.lineTotalCents,
    0,
  );

  // Filter qualifying lines according to scope
  const targetCatSet = new Set(coupon.targetCategoryIds ?? []);
  const targetItemSet = new Set(coupon.targetItemIds ?? []);

  const qualifyingLines = lines.filter((line) => {
    if (line.lineTotalCents <= 0) return false;
    if (coupon.scope === "global") return true;
    if (coupon.scope === "category") {
      return line.categoryId ? targetCatSet.has(line.categoryId) : false;
    }
    if (coupon.scope === "item") {
      return line.resourceId ? targetItemSet.has(line.resourceId) : false;
    }
    return false;
  });

  const applicableSubtotalCents = qualifyingLines.reduce(
    (sum, line) => sum + line.lineTotalCents,
    0,
  );

  const eligibility = evaluateCouponEligibility(
    coupon,
    applicableSubtotalCents,
    now,
  );

  if (!eligibility.isEligible) {
    return {
      isEligible: false,
      ineligibilityReason: eligibility.ineligibilityReason,
      subtotal: centsToMoney(subtotalCents),
      subtotalCents,
      discountTotal: "0.00",
      discountTotalCents: 0,
      total: centsToMoney(subtotalCents),
      totalCents: subtotalCents,
      applicableSubtotalCents,
      qualifyingLineIds: [],
      lineDiscounts: lines.map((l) => ({
        lineId: l.id,
        lineDiscountCents: 0,
        discountedLineTotalCents: l.lineTotalCents,
      })),
    };
  }

  let calculatedDiscountCents = 0;
  if (coupon.discountType === "percentage") {
    const pct = Number(coupon.discountValue);
    calculatedDiscountCents = Math.round(
      applicableSubtotalCents * (pct / 100),
    );
  } else {
    calculatedDiscountCents = moneyToCents(coupon.discountValue);
  }

  // Cap discount to applicable subtotal (never exceed subtotal, total >= 0)
  const discountTotalCents = Math.min(
    applicableSubtotalCents,
    Math.max(0, calculatedDiscountCents),
  );
  const totalCents = Math.max(0, subtotalCents - discountTotalCents);

  const lineDiscounts = prorateLineDiscounts(
    qualifyingLines,
    discountTotalCents,
  );

  return {
    isEligible: true,
    subtotal: centsToMoney(subtotalCents),
    subtotalCents,
    discountTotal: centsToMoney(discountTotalCents),
    discountTotalCents,
    total: centsToMoney(totalCents),
    totalCents,
    applicableSubtotalCents,
    qualifyingLineIds: qualifyingLines.map((l) => l.id),
    lineDiscounts,
  };
}
