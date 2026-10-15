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
    mockOrderRepo.findById.mockReset();
    mockOrderRepo.transition.mockReset();
    mockTx.select.mockReset();
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

  it.each([
    ["storefront_cash", "approved", "ready"],
    ["admin_direct", "approved", "ready"],
    ["admin_direct", "ready", "delivered"],
  ])("blocks unpaid cash orders from %s moving from %s to %s", async (source, status, nextStatus) => {
    const current = {
      id: orderId,
      tenantId,
      locationId: "loc-1",
      fulfillmentStatus: status,
      paymentStatus: "pending",
      source,
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
        body: { fulfillmentStatus: nextStatus },
      }),
    ).rejects.toThrow(OrderTransitionError);

    expect(mockOrderRepo.transition).not.toHaveBeenCalled();
  });

  it.each(["storefront_cash", "admin_direct", "mercadopago_webhook"])("advances a paid %s order through ready and then delivered", async (source) => {
    const current = {
      id: orderId,
      fulfillmentStatus: "approved",
      paymentStatus: "paid",
      source,
      tender: source === "mercadopago_webhook" ? null : "cash",
      version: 1,
    };
    const ready = { ...current, fulfillmentStatus: "ready", version: 2 };
    const delivered = { ...ready, fulfillmentStatus: "delivered", version: 3 };
    mockOrderRepo.findById.mockResolvedValueOnce(current).mockResolvedValueOnce(ready).mockResolvedValueOnce(ready).mockResolvedValueOnce(delivered);
    mockOrderRepo.transition.mockResolvedValueOnce(ready).mockResolvedValueOnce(delivered);
    const context = { tenantId, correlationId: "corr-1", source: "administrative", actor: { kind: "user", userId: "u1", role: "admin", membershipId: "m1" } } as TenantContext;
    const service = new TransitionOrderService();
    await expect(service.transition({ context, orderId, expectedVersion: 1, body: { fulfillmentStatus: "ready" } })).resolves.toEqual(ready);
    await expect(service.transition({ context, orderId, expectedVersion: 2, body: { fulfillmentStatus: "delivered" } })).resolves.toEqual(delivered);
    expect(mockOrderRepo.transition).toHaveBeenNthCalledWith(1, expect.objectContaining({ nextStatus: "ready", expectedVersion: 1 }));
    expect(mockOrderRepo.transition).toHaveBeenNthCalledWith(2, expect.objectContaining({ nextStatus: "delivered", expectedVersion: 2 }));
    expect(mockTx.insert).not.toHaveBeenCalled();
    expect(appendOutboxEvent).toHaveBeenCalledTimes(2);
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

  it("cancels a paid direct cash order without an open shift and records the withdrawal", async () => {
    const current = {
      id: orderId,
      tenantId,
      locationId: "loc-1",
      fulfillmentStatus: "approved",
      paymentStatus: "paid",
      source: "admin_direct",
      tender: "cash",
      pickupPin: null,
      version: 1,
      total: "4500.00",
      discountSnapshot: null,
    };
    const updated = { ...current, fulfillmentStatus: "cancelled", paymentStatus: "refunded", version: 2 };
    mockOrderRepo.findById.mockResolvedValueOnce(current).mockResolvedValueOnce(updated);
    mockOrderRepo.transition.mockResolvedValueOnce(updated);
    mockTx.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
    });
    const values = vi.fn().mockResolvedValue([]);
    mockTx.insert.mockReturnValue({ values });
    const context = {
      tenantId,
      correlationId: "corr-1",
      source: "administrative",
      actor: { kind: "user", userId: "u1", role: "ADMIN", membershipId: "m1" },
    } as unknown as TenantContext;

    await new TransitionOrderService().transition({
      context,
      orderId,
      expectedVersion: 1,
      body: { fulfillmentStatus: "cancelled" },
    });

    expect(mockOrderRepo.transition).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: "refunded" }),
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, orderId, type: "cancellation_withdrawal", shiftId: null }),
    );
  });

  it("queues a ready WhatsApp event only for an opted-in, paid storefront customer", async () => {
    const current = {
      id: orderId, tenantId, locationId: "loc-1", fulfillmentStatus: "preparing",
      paymentStatus: "paid", source: "storefront_cash", tender: "cash",
      pickupPin: null, version: 1, total: "4500.00", discountSnapshot: null,
      customer: { name: "Ana", phone: "1123456789", whatsappReadyOptIn: true },
    };
    const updated = { ...current, fulfillmentStatus: "ready", version: 2 };
    mockOrderRepo.findById.mockResolvedValueOnce(current).mockResolvedValueOnce(updated);
    mockOrderRepo.transition.mockResolvedValueOnce(updated);
    const context = { tenantId, correlationId: "corr-1", source: "administrative",
      actor: { kind: "user", userId: "u1", role: "ADMIN", membershipId: "m1" } } as unknown as TenantContext;

    await new TransitionOrderService().transition({ context, orderId, expectedVersion: 1, body: { fulfillmentStatus: "ready" } });
    expect(appendOutboxEvent).toHaveBeenCalledWith(mockTx, context,
      expect.objectContaining({ eventType: "order.whatsapp_ready", payload: { orderId } }));

    vi.clearAllMocks();
    const withoutConsent = { ...current, customer: { ...current.customer, whatsappReadyOptIn: false } };
    mockOrderRepo.findById.mockResolvedValueOnce(withoutConsent).mockResolvedValueOnce({ ...updated, customer: withoutConsent.customer });
    mockOrderRepo.transition.mockResolvedValueOnce(updated);
    await new TransitionOrderService().transition({ context, orderId, expectedVersion: 1, body: { fulfillmentStatus: "ready" } });
    expect(appendOutboxEvent).toHaveBeenCalledTimes(1);
    expect(appendOutboxEvent).not.toHaveBeenCalledWith(mockTx, context,
      expect.objectContaining({ eventType: "order.whatsapp_ready" }));
  });
});
