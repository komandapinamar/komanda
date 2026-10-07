import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCartFind = vi.fn();
const mockCartApplyDiscount = vi.fn();
vi.mock("@/features/cart/infrastructure/cart.repository", () => ({
  CartRepository: vi.fn().mockImplementation(function () {
    return {
      find: mockCartFind,
      applyDiscount: mockCartApplyDiscount,
    };
  }),
}));

const mockDiscountFindByCode = vi.fn();
const mockDiscountFindById = vi.fn();
vi.mock("@/features/discounts/infrastructure/discount.repository", () => ({
  DiscountRepository: vi.fn().mockImplementation(function () {
    return {
      findByCode: mockDiscountFindByCode,
      findById: mockDiscountFindById,
    };
  }),
}));

const mockHasEntitlement = vi.fn();
const mockCurrentMercadoPago = vi.fn();
const mockFindActiveByCartId = vi.fn();
const mockDecryptTokens = vi.fn();
const mockCreatePaymentAttempt = vi.fn();
const mockAttachPreference = vi.fn();
vi.mock("@/features/payments/infrastructure/integration.repository", () => ({
  IntegrationRepository: vi.fn().mockImplementation(function () {
    return {
      hasOnlinePaymentsEntitlement: mockHasEntitlement,
      currentMercadoPago: mockCurrentMercadoPago,
      findActiveByCartId: mockFindActiveByCartId,
      createPaymentAttempt: mockCreatePaymentAttempt,
      attachPreference: mockAttachPreference,
      decryptTokens: mockDecryptTokens,
    };
  }),
  PaymentAttemptIdempotencyConflictError: class PaymentAttemptIdempotencyConflictError extends Error {},
}));

const mockIdempotencyClaim = vi.fn();
const mockIdempotencyComplete = vi.fn();
const mockIdempotencyFail = vi.fn();
vi.mock("@/lib/idempotency/idempotency.service", () => ({
  IdempotencyService: vi.fn().mockImplementation(function () {
    return {
      claim: mockIdempotencyClaim,
      complete: mockIdempotencyComplete,
      fail: mockIdempotencyFail,
    };
  }),
  IdempotencyConflictError: class IdempotencyConflictError extends Error {},
  IdempotencyInProgressError: class IdempotencyInProgressError extends Error {},
}));

const mockCreateFromCartSnapshot = vi.fn();
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: vi.fn().mockImplementation(function () {
    return {
      createFromCartSnapshot: mockCreateFromCartSnapshot,
    };
  }),
}));

const mockTxSelectLimit = vi.fn();
const mockTx = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: mockTxSelectLimit }),
    }),
  }),
};

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_context, callback) => callback(mockTx)),
}));

import {
  calculateDiscountAmounts,
  CouponTenderMismatchError,
  evaluateCouponEligibility,
  type CartLineForDiscount,
  type CouponRuleInput,
} from "@/features/discounts/domain/discount.rules";
import { CartService } from "@/features/cart/application/cart.service";
import { PaymentSessionService } from "@/features/payments/application/payment-session.service";
import { CreateCashOrderService } from "@/features/orders/application/create-cash-order.service";
import { cashOrderErrorResponse } from "@/app/api/v1/storefronts/[tenantSlug]/carts/[cartId]/cash-orders/route";
import type { PublicTenantService } from "@/features/tenancy/application/public-tenant.service";

describe("Story 4.2: Coupon tender validation", () => {
  const fixedNow = new Date("2026-10-05T12:00:00.000Z");

  const cashCoupon: CouponRuleInput = {
    id: "disc-cash",
    code: "EFECTIVO10",
    discountType: "percentage",
    discountValue: "10.00",
    minOrderAmount: "0.00",
    scope: "global",
    isActive: true,
    applicableTender: "cash",
  };

  const allCoupon: CouponRuleInput = {
    id: "disc-all",
    code: "UNIVERSAL10",
    discountType: "percentage",
    discountValue: "10.00",
    minOrderAmount: "0.00",
    scope: "global",
    isActive: true,
    applicableTender: "all",
  };

  const baseLines: CartLineForDiscount[] = [
    {
      id: "line-1",
      quantity: 1,
      unitPriceCents: 500000,
      lineTotalCents: 500000,
    },
  ];

  describe("Discount engine", () => {
    it("rejects cash coupon when tender is posnet", () => {
      const result = evaluateCouponEligibility(
        cashCoupon,
        500000,
        fixedNow,
        "posnet",
      );
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("COUPON_TENDER_MISMATCH");
    });

    it("rejects cash coupon when tender is mercadopago", () => {
      const result = evaluateCouponEligibility(
        cashCoupon,
        500000,
        fixedNow,
        "mercadopago",
      );
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("COUPON_TENDER_MISMATCH");
    });

    it("admits cash coupon when tender is cash", () => {
      const result = evaluateCouponEligibility(
        cashCoupon,
        500000,
        fixedNow,
        "cash",
      );
      expect(result.isEligible).toBe(true);
    });

    it("admits cash coupon when tender is unknown (provisional cart)", () => {
      const result = evaluateCouponEligibility(
        cashCoupon,
        500000,
        fixedNow,
      );
      expect(result.isEligible).toBe(true);
    });

    it("admits universal coupon on any digital tender", () => {
      expect(
        evaluateCouponEligibility(allCoupon, 500000, fixedNow, "mercadopago")
          .isEligible,
      ).toBe(true);
      expect(
        evaluateCouponEligibility(allCoupon, 500000, fixedNow, "posnet")
          .isEligible,
      ).toBe(true);
    });

    it("returns zero discount and mismatch reason in calculation", () => {
      const result = calculateDiscountAmounts({
        lines: baseLines,
        coupon: cashCoupon,
        now: fixedNow,
        tender: "mercadopago",
      });
      expect(result.isEligible).toBe(false);
      expect(result.ineligibilityReason).toBe("COUPON_TENDER_MISMATCH");
      expect(result.discountTotal).toBe("0.00");
      expect(result.total).toBe("5000.00");
    });
  });

  const standardCart = {
    id: "cart-1",
    tenantId: "tenant-1",
    status: "validated" as const,
    currency: "ARS",
    subtotal: "5000.00",
    discountTotal: "500.00",
    total: "4500.00",
    appliedDiscountCodeId: "disc-cash",
    version: 1,
    expiresAt: new Date(fixedNow.getTime() + 60_000),
    lines: [
      {
        id: "line-1",
        itemId: "item-1",
        comboId: null,
        nameSnapshot: "Burger",
        quantity: 1,
        unitPriceSnapshot: "5000.00",
        lineTotal: "5000.00",
        imageUrlSnapshot: null,
        note: null,
        options: [],
      },
    ],
  };

  const standardTenant = {
    id: "tenant-1",
    name: "Resto",
    slug: "resto",
    currency: "ARS",
    locationId: "loc-1",
    preset: "gastronomy" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIdempotencyClaim.mockResolvedValue({
      replayed: false,
      recordId: "idemp-1",
      requestHash: "hash",
    });
    mockIdempotencyComplete.mockResolvedValue(undefined);
    mockIdempotencyFail.mockResolvedValue(undefined);
    mockTxSelectLimit.mockResolvedValue([{ salesEnabled: true }]);
    mockCartFind.mockResolvedValue(standardCart);
    mockCartApplyDiscount.mockImplementation((_id, data) =>
      Promise.resolve({ ...standardCart, ...data }),
    );
    mockDiscountFindByCode.mockResolvedValue(cashCoupon);
    mockDiscountFindById.mockResolvedValue(cashCoupon);
    mockHasEntitlement.mockResolvedValue(true);
    mockCurrentMercadoPago.mockResolvedValue({
      id: "mpa-1",
      status: "active",
      webhookRoutingKey: "rk-1",
    });
    mockFindActiveByCartId.mockResolvedValue(null);
    mockCreatePaymentAttempt.mockResolvedValue({ id: "attempt-1" });
    mockDecryptTokens.mockReturnValue({ accessToken: "tok" });
    mockCreateFromCartSnapshot.mockResolvedValue({
      order: {
        id: "ord-1",
        purchaseNumber: "1084",
        pickupPin: "7428",
        total: "4500.00",
        paymentStatus: "pending",
        paymentExpiresAt: new Date(fixedNow.getTime() + 3_600_000),
      },
      created: true,
    });
  });

  describe("Provisional application in cart", () => {
    it("marks cash coupons with tenderRestriction in discountMetadata", async () => {
      const service = new CartService(
        { resolve: vi.fn().mockResolvedValue(standardTenant) } as unknown as PublicTenantService,
        () => fixedNow,
      );

      await service.applyDiscount("resto", "cart-1", "EFECTIVO10");

      expect(mockCartApplyDiscount).toHaveBeenCalled();
      const applied = mockCartApplyDiscount.mock.calls[0][1];
      expect(applied.discountMetadata.tenderRestriction).toBe("cash");
    });

    it("does not mark universal coupons", async () => {
      mockDiscountFindByCode.mockResolvedValue(allCoupon);
      const service = new CartService(
        { resolve: vi.fn().mockResolvedValue(standardTenant) } as unknown as PublicTenantService,
        () => fixedNow,
      );

      await service.applyDiscount("resto", "cart-1", "UNIVERSAL10");

      const applied = mockCartApplyDiscount.mock.calls[0][1];
      expect(applied.discountMetadata.tenderRestriction).toBeUndefined();
    });
  });

  describe("Digital checkout rejection", () => {
    it("rejects payment session when applied coupon requires cash", async () => {
      const service = new PaymentSessionService(
        { resolve: vi.fn().mockResolvedValue(standardTenant) } as unknown as PublicTenantService,
        undefined,
        () => fixedNow,
      );

      await expect(
        service.create({
          tenantSlug: "resto",
          cartId: "cart-1",
          idempotencyKey: "idemp-session-1",
          body: { customer: { name: "Cliente" } },
          baseUrl: "https://komanda.app",
        }),
      ).rejects.toBeInstanceOf(CouponTenderMismatchError);

      expect(mockCreatePaymentAttempt).not.toHaveBeenCalled();
    });

    it("rejects payment session when the applied coupon is expired", async () => {
      mockDiscountFindById.mockResolvedValue({
        ...allCoupon,
        endsAt: new Date(fixedNow.getTime() - 60_000),
      });

      const service = new PaymentSessionService(
        { resolve: vi.fn().mockResolvedValue(standardTenant) } as unknown as PublicTenantService,
        undefined,
        () => fixedNow,
      );

      await expect(
        service.create({
          tenantSlug: "resto",
          cartId: "cart-1",
          idempotencyKey: "idemp-session-2",
          body: { customer: { name: "Cliente" } },
          baseUrl: "https://komanda.app",
        }),
      ).rejects.toBeTruthy();

      expect(mockCreatePaymentAttempt).not.toHaveBeenCalled();
    });
  });

  describe("Cash order admission", () => {
    it("creates cash order with a cash coupon", async () => {
      const service = new CreateCashOrderService(
        { resolve: vi.fn().mockResolvedValue(standardTenant) } as unknown as PublicTenantService,
        () => fixedNow,
      );

      const result = await service.create({
        tenantSlug: "resto",
        cartId: "cart-1",
        idempotencyKey: "idemp-cash-1",
        body: { customer: { name: "Cliente" } },
      });

      expect(result.paymentStatus).toBe("pending");
      expect(mockCreateFromCartSnapshot).toHaveBeenCalled();
      expect(mockCreateFromCartSnapshot.mock.calls[0][0].tender).toBe("cash");
    });

    it("creates cash order with a universal coupon", async () => {
      mockDiscountFindById.mockResolvedValue(allCoupon);
      const service = new CreateCashOrderService(
        { resolve: vi.fn().mockResolvedValue(standardTenant) } as unknown as PublicTenantService,
        () => fixedNow,
      );

      const result = await service.create({
        tenantSlug: "resto",
        cartId: "cart-1",
        idempotencyKey: "idemp-cash-2",
        body: { customer: { name: "Cliente" } },
      });

      expect(result.paymentStatus).toBe("pending");
      expect(mockCreateFromCartSnapshot).toHaveBeenCalled();
    });

    it("rejects cash order when the applied coupon is expired (full eligibility)", async () => {
      mockDiscountFindById.mockResolvedValue({
        ...cashCoupon,
        endsAt: new Date(fixedNow.getTime() - 60_000),
      });
      const service = new CreateCashOrderService(
        { resolve: vi.fn().mockResolvedValue(standardTenant) } as unknown as PublicTenantService,
        () => fixedNow,
      );

      await expect(
        service.create({
          tenantSlug: "resto",
          cartId: "cart-1",
          idempotencyKey: "idemp-cash-3",
          body: { customer: { name: "Cliente" } },
        }),
      ).rejects.toBeTruthy();

      expect(mockCreateFromCartSnapshot).not.toHaveBeenCalled();
    });

    it("maps CouponTenderMismatchError to HTTP 422", async () => {
      const response = cashOrderErrorResponse(
        new CouponTenderMismatchError(),
        "corr-1",
      );
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("COUPON_TENDER_MISMATCH");
    });
  });
});
