import { describe, expect, it } from "vitest";
import { canNotifyOwnerOfCashOrder, normalizeOwnerCashAlertPhone } from "@/features/orders/domain/owner-cash-whatsapp";

const eligible = {
  preset: "express_retail",
  phone: "+54 9 11 2345-6789",
  tender: "cash",
  paymentStatus: "pending",
};

describe("owner cash WhatsApp eligibility", () => {
  it("stores a configured Argentine mobile in canonical international format", () => {
    expect(normalizeOwnerCashAlertPhone("express_retail", "+54 9 11 2345-6789"))
      .toBe("5491123456789");
  });

  it("allows clearing the phone and rejects invalid or non-Express configuration", () => {
    expect(normalizeOwnerCashAlertPhone("express_retail", null)).toBeNull();
    expect(() => normalizeOwnerCashAlertPhone("express_retail", "invalid"))
      .toThrow("A valid Argentine mobile is required for Express tenants.");
    expect(() => normalizeOwnerCashAlertPhone("gastronomy", "+54 9 11 2345-6789"))
      .toThrow("A valid Argentine mobile is required for Express tenants.");
  });

  it("allows a configured Express cash order while payment is pending", () => {
    expect(canNotifyOwnerOfCashOrder(eligible)).toBe(true);
  });

  it.each([
    ["gastronomy preset", { preset: "gastronomy" }],
    ["missing phone", { phone: null }],
    ["invalid phone", { phone: "not-a-mobile" }],
    ["non-cash order", { tender: "posnet" }],
    ["paid order", { paymentStatus: "paid" }],
    ["verification-required order", { paymentStatus: "verification_required" }],
  ])("rejects %s", (_label, override) => {
    expect(canNotifyOwnerOfCashOrder({ ...eligible, ...override })).toBe(false);
  });
});
