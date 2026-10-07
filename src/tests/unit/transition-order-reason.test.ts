import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant-context/types";

const mockOrderRepo = {
  findById: vi.fn(),
  transition: vi.fn(),
  appendTransitionEvent: vi.fn(),
  updatePaymentStatus: vi.fn(),
  loadCart: vi.fn(),
  createFromCartSnapshot: vi.fn(),
};

const mockDiscountRepo = {
  markRedemptionCancelled: vi.fn(),
};

const mockTx = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: vi.fn(function () {
    return mockOrderRepo;
  }),
}));

vi.mock("@/features/discounts/infrastructure/discount.repository", () => ({
  DiscountRepository: vi.fn(function () {
    return mockDiscountRepo;
  }),
}));

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn().mockImplementation((_ctx, cb) => cb(mockTx)),
}));

vi.mock("@/lib/outbox/outbox.service", () => ({
  appendOutboxEvent: vi.fn().mockResolvedValue({ id: "outbox-1" }),
}));

vi.mock("@/lib/audit/audit.service", () => ({
  appendAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import { transitionOrderSchema, TransitionOrderService } from "@/features/orders/application/transition-order.service";
import { OrderTransitionError } from "@/features/orders/domain/order.rules";
import { OrderConflictError } from "@/features/orders/application/order-errors";

describe("Story 2.5: transition-order reason capture without cash movements", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const orderId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an optional reason in the schema", () => {
    expect(
      transitionOrderSchema.safeParse({ fulfillmentStatus: "cancelled", reason: "unpaid_cash_voided_by_pos" }).success,
    ).toBe(true);
    expect(transitionOrderSchema.safeParse({ fulfillmentStatus: "cancelled" }).success).toBe(true);
    expect(transitionOrderSchema.safeParse({ fulfillmentStatus: "cancelled", reason: "" }).success).toBe(false);
  });

  it("propagates the reason to audit and outbox and never inserts cash movements for an unpaid cancel", async () => {
    const current = {
      id: orderId,
      tenantId,
      locationId: "loc-1",
      fulfillmentStatus: "approved",
      paymentStatus: "pending",
      source: "storefront_cash",
      tender: "cash",
      pickupPin: "5821",
      version: 1,
      total: "4500.00",
      discountSnapshot: { discountId: "disc-1", code: "PROMO10" },
    };
    const updated = { ...current, fulfillmentStatus: "cancelled", version: 2 };

    mockOrderRepo.findById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(updated);
    mockOrderRepo.transition.mockResolvedValueOnce(updated);

    const service = new TransitionOrderService();
    const context = {
      tenantId,
      correlationId: "corr-1",
      source: "administrative",
      actor: { kind: "user", userId: "u1", role: "ADMIN", membershipId: "m1" },
    } as unknown as TenantContext;

    await service.transition({
      context,
      orderId,
      expectedVersion: 1,
      body: { fulfillmentStatus: "cancelled", reason: "unpaid_cash_voided_by_pos" },
    });

    expect(mockTx.insert).not.toHaveBeenCalled();
    expect(mockDiscountRepo.markRedemptionCancelled).toHaveBeenCalledWith(orderId);
    expect(mockOrderRepo.appendTransitionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "unpaid_cash_voided_by_pos" }),
    );
    expect(appendAuditEvent).toHaveBeenCalledWith(
      mockTx,
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "unpaid_cash_voided_by_pos" }),
      }),
    );
    expect(appendOutboxEvent).toHaveBeenCalledWith(
      mockTx,
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ reason: "unpaid_cash_voided_by_pos" }),
      }),
    );
  });

  it("blocks advancing an unpaid storefront_cash order (AD-3 server-side)", async () => {
    const current = {
      id: orderId,
      tenantId,
      locationId: "loc-1",
      fulfillmentStatus: "approved",
      paymentStatus: "pending",
      source: "storefront_cash",
      tender: "cash",
      pickupPin: "5821",
      version: 1,
      total: "4500.00",
      discountSnapshot: null,
    };
    mockOrderRepo.findById.mockResolvedValueOnce(current);

    const service = new TransitionOrderService();
    const context = {
      tenantId,
      correlationId: "corr-1",
      source: "administrative",
      actor: { kind: "user", userId: "u1", role: "ADMIN", membershipId: "m1" },
    } as unknown as TenantContext;

    await expect(
      service.transition({
        context,
        orderId,
        expectedVersion: 1,
        body: { fulfillmentStatus: "ready" },
      }),
    ).rejects.toThrow(OrderTransitionError);

    expect(mockOrderRepo.transition).not.toHaveBeenCalled();
  });

  it("blocks generic cancel of a PAID storefront_cash order (must use refund-cash)", async () => {
    const current = {
      id: orderId,
      tenantId,
      locationId: "loc-1",
      fulfillmentStatus: "approved",
      paymentStatus: "paid",
      source: "storefront_cash",
      tender: "cash",
      pickupPin: "5821",
      version: 1,
      total: "4500.00",
      discountSnapshot: null,
    };
    mockOrderRepo.findById.mockResolvedValueOnce(current);

    const service = new TransitionOrderService();
    const context = {
      tenantId,
      correlationId: "corr-1",
      source: "administrative",
      actor: { kind: "user", userId: "u1", role: "ADMIN", membershipId: "m1" },
    } as unknown as TenantContext;

    await expect(
      service.transition({
        context,
        orderId,
        expectedVersion: 1,
        body: { fulfillmentStatus: "cancelled" },
      }),
    ).rejects.toThrow(OrderConflictError);

    expect(mockOrderRepo.transition).not.toHaveBeenCalled();
  });
});
