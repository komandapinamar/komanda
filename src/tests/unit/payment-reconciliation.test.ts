import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderTransitionError } from "@/features/orders/domain/order.rules";
import type { TenantContext } from "@/lib/tenant-context/types";
import type { MercadoPagoPayment, MercadoPagoPaymentLookup } from "@/features/payments/application/mercadopago-webhook.service";

const mockOrderRepo = {
  findById: vi.fn(),
  transition: vi.fn(),
  appendTransitionEvent: vi.fn(),
  updatePaymentStatus: vi.fn(),
  loadCart: vi.fn(),
  createFromCartSnapshot: vi.fn(),
};

const mockIntegrationRepo = {
  currentMercadoPago: vi.fn(),
  decryptTokens: vi.fn(),
};

const mockTxSelectLimit = vi.fn();
const mockTx = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: mockTxSelectLimit,
      }),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }),
};

vi.mock("@/features/orders/infrastructure/order.repository", () => {
  return {
    OrderRepository: vi.fn(function () {
      return mockOrderRepo;
    }),
  };
});

vi.mock("@/features/payments/infrastructure/integration.repository", () => {
  return {
    IntegrationRepository: vi.fn(function () {
      return mockIntegrationRepo;
    }),
  };
});

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn().mockImplementation((_ctx, cb) => cb(mockTx)),
  withPlatformServiceTransaction: vi.fn().mockImplementation((_ctx, cb) => cb(mockTx)),
}));

vi.mock("@/lib/outbox/outbox.service", () => ({
  appendOutboxEvent: vi.fn().mockResolvedValue({ id: "outbox-1" }),
}));

vi.mock("@/lib/audit/audit.service", () => ({
  appendAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { TransitionOrderService } from "@/features/orders/application/transition-order.service";
import { PaymentReconciliationService } from "@/features/payments/application/payment-reconciliation.service";

describe("Hito 2: Verification Required & Payment Reconciliation", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const orderId = "22222222-2222-4222-8222-222222222222";
  const attemptId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prevents transition to delivered when paymentStatus is verification_required", async () => {
    const mockOrder = {
      id: orderId,
      tenantId,
      locationId: "loc-1",
      fulfillmentStatus: "ready",
      paymentStatus: "verification_required",
      source: "admin_direct",
      tender: "posnet",
      version: 1,
      total: "1000.00",
    };

    mockOrderRepo.findById.mockResolvedValueOnce(mockOrder);

    const service = new TransitionOrderService();
    const context = {
      tenantId,
      correlationId: "test-corr",
      source: "administrative",
      actor: { kind: "user", userId: "u1", role: "ADMIN", membershipId: "m1" },
    } as unknown as TenantContext;

    await expect(
      service.transition({
        context,
        orderId,
        expectedVersion: 1,
        body: { fulfillmentStatus: "delivered" },
      }),
    ).rejects.toThrow(OrderTransitionError);
    expect(mockOrderRepo.transition).not.toHaveBeenCalled();
  });

  it("reconciles payment attempt when provider returns approved", async () => {
    const mockAttempt = {
      id: attemptId,
      tenantId,
      cartId: "cart-1",
      providerPaymentId: "mp-pay-999",
      status: "verification_required",
      createdAt: new Date(),
      customerSnapshot: { name: "Juan" },
      notes: null,
    };

    const mockOrder = {
      id: orderId,
      tenantId,
      paymentStatus: "verification_required",
      paymentAttemptId: attemptId,
    };

    const mockAccount = {
      id: "acc-1",
      tenantId,
    };

    mockTxSelectLimit
      .mockResolvedValueOnce([mockAttempt]) // paymentAttempts
      .mockResolvedValueOnce([mockOrder]);   // tenantOrders

    mockIntegrationRepo.currentMercadoPago.mockResolvedValueOnce(mockAccount);
    mockIntegrationRepo.decryptTokens.mockReturnValueOnce({ accessToken: "test-token" });
    mockOrderRepo.updatePaymentStatus.mockResolvedValueOnce({ ...mockOrder, paymentStatus: "paid" });

    const mockPaymentClient: MercadoPagoPaymentLookup = {
      getPayment: vi.fn().mockResolvedValue({
        id: "mp-pay-999",
        status: "approved",
        date_approved: new Date().toISOString(),
      } as MercadoPagoPayment),
    };

    const reconciler = new PaymentReconciliationService(mockPaymentClient);
    const result = await reconciler.reconcilePaymentAttempt({
      tenantId,
      attemptId,
    });

    expect(result.resolved).toBe(true);
    expect(result.nextStatus).toBe("approved");
    expect(mockPaymentClient.getPayment).toHaveBeenCalledWith("test-token", "mp-pay-999");
    expect(mockOrderRepo.updatePaymentStatus).toHaveBeenCalledWith({
      orderId,
      paymentStatus: "paid",
    });
  });

  it("marks attempt rejected and order failed when provider rejects payment", async () => {
    const mockAttempt = {
      id: attemptId,
      tenantId,
      cartId: "cart-1",
      providerPaymentId: "mp-pay-reject",
      status: "verification_required",
      createdAt: new Date(),
    };

    const mockOrder = {
      id: orderId,
      tenantId,
      paymentStatus: "verification_required",
      paymentAttemptId: attemptId,
    };

    const mockAccount = { id: "acc-1", tenantId };

    mockTxSelectLimit
      .mockResolvedValueOnce([mockAttempt])
      .mockResolvedValueOnce([mockOrder]);

    mockIntegrationRepo.currentMercadoPago.mockResolvedValueOnce(mockAccount);
    mockIntegrationRepo.decryptTokens.mockReturnValueOnce({ accessToken: "test-token" });
    mockOrderRepo.updatePaymentStatus.mockResolvedValueOnce({ ...mockOrder, paymentStatus: "failed" });

    const mockPaymentClient: MercadoPagoPaymentLookup = {
      getPayment: vi.fn().mockResolvedValue({
        id: "mp-pay-reject",
        status: "rejected",
      } as MercadoPagoPayment),
    };

    const reconciler = new PaymentReconciliationService(mockPaymentClient);
    const result = await reconciler.reconcilePaymentAttempt({
      tenantId,
      attemptId,
    });

    expect(result.resolved).toBe(true);
    expect(result.nextStatus).toBe("rejected");
    expect(mockOrderRepo.updatePaymentStatus).toHaveBeenCalledWith({
      orderId,
      paymentStatus: "failed",
    });
  });
});
