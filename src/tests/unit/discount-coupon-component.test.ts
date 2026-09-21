import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscountCouponInput } from "@/features/shop/cart/components/DiscountCouponInput";
import type { AppliedDiscountInfo } from "@/types/types";

describe("Story 2.4: Discount Coupon Component & UI", () => {
  it("renders input field and apply button when no discount is applied", () => {
    const onApply = vi.fn().mockResolvedValue({ success: true });
    const onRemove = vi.fn().mockResolvedValue(undefined);

    const html = renderToStaticMarkup(
      React.createElement(DiscountCouponInput, {
        appliedDiscount: null,
        discountTotal: 0,
        onApply,
        onRemove,
      }),
    );

    expect(html).toContain("data-testid=\"discount-code-input\"");
    expect(html).toContain("data-testid=\"apply-discount-btn\"");
    expect(html).toContain("placeholder=\"Ingres\u00e1 tu cup\u00f3n\"");
  });

  it("renders discount badge with code and percentage when percentage discount is applied", () => {
    const applied: AppliedDiscountInfo = {
      code: "PROMO20",
      name: "Promo Verano",
      discountType: "percentage",
      discountValue: "20.00",
    };
    const onApply = vi.fn().mockResolvedValue({ success: true });
    const onRemove = vi.fn().mockResolvedValue(undefined);

    const html = renderToStaticMarkup(
      React.createElement(DiscountCouponInput, {
        appliedDiscount: applied,
        discountTotal: 1500,
        onApply,
        onRemove,
      }),
    );

    expect(html).toContain("data-testid=\"applied-discount-badge\"");
    expect(html).toContain("PROMO20");
    expect(html).toContain("20% OFF");
    expect(html).toContain("aria-label=\"Quitar cup\u00f3n\"");
  });

  it("renders discount badge with formatted fixed amount when fixed discount is applied", () => {
    const applied: AppliedDiscountInfo = {
      code: "FIJO500",
      name: "Descuento 500",
      discountType: "fixed_amount",
      discountValue: "500.00",
    };
    const onApply = vi.fn().mockResolvedValue({ success: true });
    const onRemove = vi.fn().mockResolvedValue(undefined);

    const html = renderToStaticMarkup(
      React.createElement(DiscountCouponInput, {
        appliedDiscount: applied,
        discountTotal: 500,
        onApply,
        onRemove,
      }),
    );

    expect(html).toContain("data-testid=\"applied-discount-badge\"");
    expect(html).toContain("FIJO500");
    expect(html).toContain("-$500");
  });
});
