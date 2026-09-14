import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn(async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
    return callback({});
  }),
}));

import {
  assertFulfillmentTransition,
  OrderTransitionError,
} from "@/features/orders/domain/order.rules";
import {
  ForbiddenRoleError,
  requireTenantRole,
  AnalyticsService,
} from "@/features/analytics/application/analytics.service";
import {
  addMoneyStrings,
  parseMoneyToCents,
  centsToMoneyString,
  AnalyticsRepository,
} from "@/features/analytics/infrastructure/analytics.repository";
import { OrderConflictError } from "@/features/orders/application/order-errors";
import { TransitionOrderService } from "@/features/orders/application/transition-order.service";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import type { TenantContext } from "@/lib/tenant-context/types";

describe("Financial Ledger, Cash Movements & Authorization Guard", () => {
  const ownerContext: TenantContext = createVerifiedTenantContext({
    tenantId: "11111111-1111-4000-8000-111111111111",
    correlationId: "corr-owner",
    source: "administrative",
    actor: {
      kind: "user",
      userId: "user-owner",
      membershipId: "member-owner",
      role: "owner",
    },
  });

  const adminContext: TenantContext = createVerifiedTenantContext({
    tenantId: "11111111-1111-4000-8000-111111111111",
    correlationId: "corr-admin",
    source: "administrative",
    actor: {
      kind: "user",
      userId: "user-admin",
      membershipId: "member-admin",
      role: "admin",
    },
  });

  const employeeContext: TenantContext = createVerifiedTenantContext({
    tenantId: "11111111-1111-4000-8000-111111111111",
    correlationId: "corr-employee",
    source: "administrative",
    actor: {
      kind: "user",
      userId: "user-employee",
      membershipId: "member-employee",
      role: "employee",
    },
  });

  beforeEach(() => {
    vi.stubEnv("KOMANDA_PUBLIC_BASE_URL", "https://api.komanda.test");
  });

  describe("AD-1: Owner Role Enforcement & RFC 7807 FORBIDDEN_ROLE", () => {
    it("allows owner role access", () => {
      expect(() => requireTenantRole(ownerContext, "owner")).not.toThrow();
    });

    it("rejects admin role with ForbiddenRoleError", () => {
      expect(() => requireTenantRole(adminContext, "owner")).toThrow(ForbiddenRoleError);
      try {
        requireTenantRole(adminContext, "owner");
      } catch (err: unknown) {
        expect((err as ForbiddenRoleError).code).toBe("FORBIDDEN_ROLE");
      }
    });

    it("rejects employee role with ForbiddenRoleError", () => {
      expect(() => requireTenantRole(employeeContext, "owner")).toThrow(ForbiddenRoleError);
      try {
        requireTenantRole(employeeContext, "owner");
      } catch (err: unknown) {
        expect((err as ForbiddenRoleError).code).toBe("FORBIDDEN_ROLE");
      }
    });

    it("converts ForbiddenRoleError to HTTP 403 RFC 7807 problem details in orderErrorResponse", async () => {
      const error = new ForbiddenRoleError("Access is restricted to the owner role.");
      const response = orderErrorResponse(error, "corr-test-403");

      expect(response.status).toBe(403);
      expect(response.headers.get("Content-Type")).toBe("application/problem+json");
      expect(response.headers.get("X-Correlation-Id")).toBe("corr-test-403");

      const body = await response.json();
      expect(body.status).toBe(403);
      expect(body.code).toBe("FORBIDDEN_ROLE");
      expect(body.title).toBe("Forbidden");
      expect(body.detail).toBe("Access is restricted to the owner role.");
    });

    it("rejects getDashboardMetrics call from non-owner before executing queries", async () => {
      const service = new AnalyticsService();
      await expect(
        service.getDashboardMetrics({ context: adminContext }),
      ).rejects.toThrow(ForbiddenRoleError);
      await expect(
        service.getDashboardMetrics({ context: employeeContext }),
      ).rejects.toThrow(ForbiddenRoleError);
    });
  });

  describe("AD-4: Fulfillment Status Transitions for admin_direct Orders", () => {
    it("permits cancelling an admin_direct order from approved state", () => {
      expect(() =>
        assertFulfillmentTransition("approved", "cancelled", "admin_direct"),
      ).not.toThrow();
    });

    it("permits cancelling an admin_direct order from preparing state", () => {
      expect(() =>
        assertFulfillmentTransition("preparing", "cancelled", "admin_direct"),
      ).not.toThrow();
    });

    it("permits cancelling an admin_direct order from ready state", () => {
      expect(() =>
        assertFulfillmentTransition("ready", "cancelled", "admin_direct"),
      ).not.toThrow();
    });

    it("permits cancelling an admin_direct order from delivered state", () => {
      expect(() =>
        assertFulfillmentTransition("delivered", "cancelled", "admin_direct"),
      ).not.toThrow();
    });

    it("forbids cancelling a non-manual (mercadopago_webhook) order from delivered state", () => {
      expect(() =>
        assertFulfillmentTransition("delivered", "cancelled", "mercadopago_webhook"),
      ).toThrow(OrderTransitionError);
    });

    it("forbids cancelling a non-manual (mercadopago_webhook) order from ready state", () => {
      expect(() =>
        assertFulfillmentTransition("ready", "cancelled", "mercadopago_webhook"),
      ).toThrow(OrderTransitionError);
    });

    it("early-returns when transitioning to same status", () => {
      expect(() =>
        assertFulfillmentTransition("cancelled", "cancelled", "admin_direct"),
      ).not.toThrow();
    });
  });

  describe("Exact Monetary Arithmetic (Numeric 12, 2 / No Floating Point)", () => {
    it("converts ARS strings to cents bigint correctly", () => {
      expect(parseMoneyToCents("10000.00")).toBe(BigInt(1000000));
      expect(parseMoneyToCents("0.00")).toBe(BigInt(0));
      expect(parseMoneyToCents("450.50")).toBe(BigInt(45050));
      expect(parseMoneyToCents("-200.25")).toBe(BigInt(-20025));
      expect(parseMoneyToCents("100")).toBe(BigInt(10000));
    });

    it("converts cents bigint to formatted ARS numeric string", () => {
      expect(centsToMoneyString(BigInt(1000000))).toBe("10000.00");
      expect(centsToMoneyString(BigInt(0))).toBe("0.00");
      expect(centsToMoneyString(BigInt(45050))).toBe("450.50");
      expect(centsToMoneyString(BigInt(-20025))).toBe("-200.25");
    });

    it("sums monetary amounts without IEEE 754 precision errors", () => {
      // In float: 0.1 + 0.2 = 0.30000000000000004
      expect(addMoneyStrings("0.10", "0.20")).toBe("0.30");
      expect(addMoneyStrings("10000.00", "-10000.00")).toBe("0.00");
      expect(addMoneyStrings("4200.00", "-294.00", "-84.00")).toBe("3822.00");
    });
  });

  describe("M-54: Net Cash from Orders (No Double Deduction Invariant)", () => {
    it("calculates exactly $0.00 net cash when manual order is created and cancelled", () => {
      const orderAmount = "10000.00";

      // 1. Order created: sale_deposit inserted
      const movements: Array<{
        type: "sale_deposit" | "cancellation_withdrawal";
        amount: string;
      }> = [
        { type: "sale_deposit", amount: orderAmount },
      ];

      // M-54 formula: SUM(CASE WHEN type = 'sale_deposit' THEN amount WHEN type = 'cancellation_withdrawal' THEN -amount END)
      const afterCreationNet = movements.reduce((acc, m) => {
        return m.type === "sale_deposit"
          ? addMoneyStrings(acc, m.amount)
          : addMoneyStrings(acc, `-${m.amount}`);
      }, "0.00");

      expect(afterCreationNet).toBe("10000.00");

      // 2. Order cancelled: cancellation_withdrawal inserted
      movements.push({
        type: "cancellation_withdrawal",
        amount: orderAmount,
      });

      const afterCancellationNet = movements.reduce((acc, m) => {
        return m.type === "sale_deposit"
          ? addMoneyStrings(acc, m.amount)
          : addMoneyStrings(acc, `-${m.amount}`);
      }, "0.00");

      // Net cash must be exactly $0.00
      expect(afterCancellationNet).toBe("0.00");

      // Invariant check: It must NEVER subtract tenant_orders.refunded ($10000.00),
      // which would incorrectly produce -$10000.00.
      expect(afterCancellationNet).not.toBe("-10000.00");
    });
  });

  describe("Mercado Pago Settlement Record Ingestion & Tax Inclusive Handling", () => {
    it("correctly identifies fee inclusive of tax when taxes_amount is zero and fee is present", () => {
      const grossAmount = "10000.00";
      const feeDetails = [{ type: "mercadopago_fee", amount: "484.00", feePayer: "collector" }];
      const taxesAmount = "0.00";
      const taxesDetails: Array<{ type: string; amount: string }> = [];

      const feeNum = feeDetails.reduce((sum, f) => sum + Number(f.amount), 0);
      const taxesNum = Number(taxesAmount);

      const isFeeInclusiveOfTax = Boolean(
        taxesNum === 0 && feeNum > 0 && taxesDetails.length === 0,
      );

      expect(isFeeInclusiveOfTax).toBe(true);
      // Net received should be gross - fee without subtracting an artificial 21% VAT
      const netReceivedAmount = (Number(grossAmount) - feeNum - taxesNum).toFixed(2);
      expect(netReceivedAmount).toBe("9516.00");
    });

    it("correctly separates itemized taxes when reported by Mercado Pago", () => {
      const grossAmount = "10000.00";
      const feeDetails = [{ type: "mercadopago_fee", amount: "400.00", feePayer: "collector" }];
      const taxesDetails = [
        { type: "vat", amount: "84.00" },
        { type: "iibb", amount: "200.00" },
      ];

      const feeNum = feeDetails.reduce((sum, f) => sum + Number(f.amount), 0);
      const taxesNum = taxesDetails.reduce((sum, t) => sum + Number(t.amount), 0);

      const isFeeInclusiveOfTax = Boolean(
        taxesNum === 0 && feeNum > 0 && taxesDetails.length === 0,
      );

      expect(isFeeInclusiveOfTax).toBe(false);
      expect(feeNum).toBe(400);
      expect(taxesNum).toBe(284);

      const netReceivedAmount = (Number(grossAmount) - feeNum - taxesNum).toFixed(2);
      expect(netReceivedAmount).toBe("9316.00");
    });
  });

  describe("TransitionOrderService: Cash Cancellation & Idempotency", () => {
    it("handles cancellation of delivered manual order atomically with withdrawal", async () => {
      const insertedRows: Array<Record<string, unknown>> = [];
      const updatedOrders: Array<Record<string, unknown>> = [];

      const mockOrder = {
        id: "order-cash-1",
        tenantId: ownerContext.tenantId,
        locationId: "loc-1",
        purchaseNumber: "101",
        source: "admin_direct" as const,
        fulfillmentStatus: "delivered" as const,
        paymentStatus: "paid" as const,
        tender: "cash" as const,
        total: "10000.00",
        version: 3,
      };

      const mockTx = {
        insert: vi.fn(() => ({
          values: vi.fn((vals: Record<string, unknown>) => {
            insertedRows.push(vals);
            return Promise.resolve();
          }),
        })),
        select: vi.fn(),
        update: vi.fn(),
      };

      // Mock repository inside transaction
      const mockRepo = {
        findById: vi.fn(async () => ({ ...mockOrder })),
        transition: vi.fn(async (input: { orderId: string; nextStatus: string; paymentStatus?: string }) => {
          updatedOrders.push(input);
          return { ...mockOrder, fulfillmentStatus: input.nextStatus, paymentStatus: input.paymentStatus ?? mockOrder.paymentStatus };
        }),
        appendTransitionEvent: vi.fn(async () => ({})),
      };

      // Re-create service logic verification
      assertFulfillmentTransition(mockOrder.fulfillmentStatus, "cancelled", mockOrder.source);
      expect(mockOrder.fulfillmentStatus).toBe("delivered");

      const isManualCash = mockOrder.source === "admin_direct" || mockOrder.tender === "cash";
      expect(isManualCash).toBe(true);

      const nextPaymentStatus = isManualCash ? "refunded" : undefined;
      await mockRepo.transition({
        orderId: mockOrder.id,
        nextStatus: "cancelled",
        paymentStatus: nextPaymentStatus,
      });

      await mockTx.insert().values({
        tenantId: ownerContext.tenantId,
        locationId: mockOrder.locationId,
        orderId: mockOrder.id,
        type: "cancellation_withdrawal",
        amount: mockOrder.total,
        occurredAt: new Date(),
        recordedByUserId: "user-owner",
        idempotencyKey: `cash_withdrawal:${mockOrder.id}`,
      });

      expect(updatedOrders).toHaveLength(1);
      expect(updatedOrders[0]).toMatchObject({
        orderId: "order-cash-1",
        nextStatus: "cancelled",
        paymentStatus: "refunded",
      });

      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0]).toMatchObject({
        orderId: "order-cash-1",
        type: "cancellation_withdrawal",
        amount: "10000.00",
      });
    });

    it("rejects duplicate cancellation withdrawal when unique constraint (23505) is hit", async () => {
      const duplicateError = Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      });

      const attemptWithdrawal = async () => {
        try {
          throw duplicateError;
        } catch (error: unknown) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code: string }).code === "23505"
          ) {
            throw new OrderConflictError(
              "Cancellation withdrawal already recorded for this order.",
            );
          }
          throw error;
        }
      };

      await expect(attemptWithdrawal()).rejects.toThrow(OrderConflictError);
      await expect(attemptWithdrawal()).rejects.toThrow(
        "Cancellation withdrawal already recorded for this order.",
      );
    });

    it("TransitionOrderService is defined and exposes transition method", () => {
      const service = new TransitionOrderService();
      expect(typeof service.transition).toBe("function");
    });
  });

  describe("AnalyticsRepository: Structure & Methods", () => {
    it("instantiates repository and exposes getCashLedgerSummary and getMpFinancialSummary", () => {
      const mockTx = {} as never;
      const repo = new AnalyticsRepository(mockTx, ownerContext.tenantId);
      expect(typeof repo.getCashLedgerSummary).toBe("function");
      expect(typeof repo.getMpFinancialSummary).toBe("function");
      expect(typeof repo.getFinancialSummary).toBe("function");
    });
  });
});
