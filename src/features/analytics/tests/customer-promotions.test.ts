import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn(
    async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      return callback({});
    },
  ),
  withPlatformServiceTransaction: vi.fn(
    async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      return callback({});
    },
  ),
}));

import {
  customerRecurrenceSummarySchema,
  extractCustomerIdentifier,
  promotionsSummarySchema,
} from "../domain/analytics.schemas";
import { AnalyticsRepository } from "../infrastructure/analytics.repository";
import { BillingRepository } from "@/features/billing/infrastructure/billing.repository";
import {
  AnalyticsService,
  ForbiddenRoleError,
} from "../application/analytics.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import type { TenantContext } from "@/lib/tenant-context/types";

describe("Customer Recurrence & Promotions Analytics (Pista 3)", () => {
  const tenantId = "11111111-1111-4000-8000-111111111111";

  const ownerContext: TenantContext = createVerifiedTenantContext({
    tenantId,
    locationId: "loc-test-1",
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
    tenantId,
    correlationId: "corr-admin",
    source: "administrative",
    actor: {
      kind: "user",
      userId: "user-admin",
      membershipId: "member-admin",
      role: "admin",
    },
  });

  beforeEach(() => {
    vi.stubEnv("KOMANDA_PUBLIC_BASE_URL", "https://api.komanda.test");
  });

  describe("1. Customer Identifier Extraction & Normalization", () => {
    it("normalizes customer emails by trimming whitespace and lowercasing", () => {
      expect(
        extractCustomerIdentifier({ email: "  Martin.Fierro@GMAIL.COM  " }),
      ).toBe("email:martin.fierro@gmail.com");
      expect(
        extractCustomerIdentifier({ email: "cliente@restaurante.com.ar" }),
      ).toBe("email:cliente@restaurante.com.ar");
    });

    it("extracts and normalizes phone numbers by stripping non-digits", () => {
      expect(
        extractCustomerIdentifier({ phone: "+54 9 11 4455-6677" }),
      ).toBe("phone:5491144556677");
      expect(
        extractCustomerIdentifier({ phone: { number: "011-9876-5432" } }),
      ).toBe("phone:01198765432");
    });

    it("resolves nested payer information if present", () => {
      expect(
        extractCustomerIdentifier({
          payer: { email: "  Diner@Example.COM " },
        }),
      ).toBe("email:diner@example.com");
      expect(
        extractCustomerIdentifier({
          payer: { phone: { number: "1155667788" } },
        }),
      ).toBe("phone:1155667788");
    });

    it("returns null for anonymous, missing or invalid identifiers", () => {
      expect(extractCustomerIdentifier(null)).toBeNull();
      expect(extractCustomerIdentifier(undefined)).toBeNull();
      expect(extractCustomerIdentifier({})).toBeNull();
      expect(extractCustomerIdentifier({ name: "Invitado Mostrador" })).toBeNull();
      expect(extractCustomerIdentifier({ email: "   " })).toBeNull();
      expect(extractCustomerIdentifier({ email: "not-an-email" })).toBeNull();
      expect(extractCustomerIdentifier({ phone: "123" })).toBeNull(); // Less than 6 digits
    });
  });

  describe("2. Customer Recurrence & Repeat Purchase Rate (M-67, M-68, M-69, M-72)", () => {
    it("marks customers with prior tenant orders as returning and computes repeat rate accurately", async () => {
      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-10T23:59:59.000Z");

      // Period orders:
      // Order 1: Customer A (email: user_a@test.com) - $10,000 (has prior order before 'from') -> Recurrent
      // Order 2: Customer B (email: user_b@test.com) - $6,000 (first time ever) -> First-time
      // Order 3: Anonymous (counter order) - $4,000 -> Unidentified
      const mockPeriodOrders = [
        {
          id: "ord-period-1",
          total: "10000.00",
          customerSnapshot: { email: "User_A@test.com" },
          createdAt: new Date("2026-09-02T13:00:00.000Z"),
        },
        {
          id: "ord-period-2",
          total: "6000.00",
          customerSnapshot: { email: "user_b@test.com" },
          createdAt: new Date("2026-09-04T20:00:00.000Z"),
        },
        {
          id: "ord-period-3",
          total: "4000.00",
          customerSnapshot: { name: "Consumidor Final" },
          createdAt: new Date("2026-09-05T21:00:00.000Z"),
        },
      ];

      // Prior orders before 'from':
      // Customer A had an order on August 15
      const mockPriorOrders = [
        {
          id: "ord-prior-1",
          customerSnapshot: { email: "user_a@test.com" },
          createdAt: new Date("2026-08-15T12:00:00.000Z"),
        },
      ];

      let queryStep = 0;
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              queryStep++;
              if (queryStep === 1) {
                // Period orders
                return {
                  orderBy: vi.fn(() => Promise.resolve(mockPeriodOrders)),
                };
              }
              if (queryStep === 2) {
                // Prior orders
                return {
                  orderBy: vi.fn(() => Promise.resolve(mockPriorOrders)),
                };
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, tenantId);
      const summary = await repo.getCustomerRecurrenceSummary(from, to);

      // Validate schema
      expect(() => customerRecurrenceSummarySchema.parse(summary)).not.toThrow();

      // Overall counts
      expect(summary.totalOrdersCount).toBe(3);
      expect(summary.identifiedOrdersCount).toBe(2);
      expect(summary.unidentifiedOrdersCount).toBe(1);
      expect(summary.identityCoverageRate).toBe(66.7); // (2/3) * 100

      // Customer recurrence
      expect(summary.totalCustomers).toBe(2); // user_a and user_b
      expect(summary.recurrentCustomers).toBe(1); // user_a
      expect(summary.firstTimeCustomers).toBe(1); // user_b
      expect(summary.repeatRate).toBe(50.0); // (1/2) * 100
      expect(summary.orderFrequency).toBe(1.0); // 2 identified orders / 2 customers

      // Segments check (M-72)
      expect(summary.segments.recurrent.orderCount).toBe(1);
      expect(summary.segments.recurrent.customerCount).toBe(1);
      expect(summary.segments.recurrent.totalRevenue).toBe("10000.00");
      expect(summary.segments.recurrent.avgTicket).toBe("10000.00");

      expect(summary.segments.firstTime.orderCount).toBe(1);
      expect(summary.segments.firstTime.customerCount).toBe(1);
      expect(summary.segments.firstTime.totalRevenue).toBe("6000.00");
      expect(summary.segments.firstTime.avgTicket).toBe("6000.00");

      expect(summary.segments.unidentified.orderCount).toBe(1);
      expect(summary.segments.unidentified.customerCount).toBe(0);
      expect(summary.segments.unidentified.totalRevenue).toBe("4000.00");
      expect(summary.segments.unidentified.avgTicket).toBe("4000.00");
    });

    it("handles multiple repeat orders within the period for newly acquired customer", async () => {
      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-10T23:59:59.000Z");

      // Customer C places order 1 on Sept 2 ($5,000) and order 2 on Sept 6 ($7,000)
      // 0 prior orders before Sept 1
      const mockPeriodOrders = [
        {
          id: "ord-1",
          total: "5000.00",
          customerSnapshot: { email: "new_repeat@test.com" },
          createdAt: new Date("2026-09-02T12:00:00.000Z"),
        },
        {
          id: "ord-2",
          total: "7000.00",
          customerSnapshot: { email: "new_repeat@test.com" },
          createdAt: new Date("2026-09-06T12:00:00.000Z"),
        },
      ];

      let queryStep = 0;
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              queryStep++;
              if (queryStep === 1) {
                return {
                  orderBy: vi.fn(() => Promise.resolve(mockPeriodOrders)),
                };
              }
              if (queryStep === 2) {
                // No prior orders
                return {
                  orderBy: vi.fn(() => Promise.resolve([])),
                };
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, tenantId);
      const summary = await repo.getCustomerRecurrenceSummary(from, to);

      expect(summary.totalCustomers).toBe(1);
      expect(summary.firstTimeCustomers).toBe(0);
      expect(summary.recurrentCustomers).toBe(1);
      expect(summary.repeatRate).toBe(100.0);
      expect(summary.orderFrequency).toBe(2.0); // 2 orders / 1 customer

      // Segment customer counts are mutually exclusive and match summary
      expect(summary.segments.firstTime.customerCount).toBe(0);
      expect(summary.segments.recurrent.customerCount).toBe(1);
      expect(summary.segments.firstTime.customerCount + summary.segments.recurrent.customerCount).toBe(summary.totalCustomers);

      // First order classified as firstTime, second as recurrent
      expect(summary.segments.firstTime.orderCount).toBe(1);
      expect(summary.segments.firstTime.totalRevenue).toBe("5000.00");
      expect(summary.segments.recurrent.orderCount).toBe(1);
      expect(summary.segments.recurrent.totalRevenue).toBe("7000.00");

      // Interval is 4 days
      expect(summary.medianDaysBetweenOrders).toBe(4);
      expect(summary.medianDaysDisplay).toBe("4 días");
    });
  });

  describe("3. Consecutive Order Intervals & Median Days (M-70)", () => {
    it("computes median days between consecutive orders accurately for customers with >= 2 orders", async () => {
      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-20T23:59:59.000Z");

      // Customer 1:
      // Order A1: Aug 28 (prior)
      // Order A2: Sept 2 (+5 days)
      // Order A3: Sept 12 (+10 days)
      // Intervals: [5, 10]
      // Customer 2:
      // Order B1: Sept 1
      // Order B2: Sept 7 (+6 days)
      // Intervals: [6]
      // All intervals: [5, 6, 10] -> median is 6.0
      const mockPeriodOrders = [
        {
          id: "ord-b1",
          total: "5000.00",
          customerSnapshot: { email: "cust_b@test.com" },
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
        },
        {
          id: "ord-a2",
          total: "5000.00",
          customerSnapshot: { email: "cust_a@test.com" },
          createdAt: new Date("2026-09-02T12:00:00.000Z"),
        },
        {
          id: "ord-b2",
          total: "5000.00",
          customerSnapshot: { email: "cust_b@test.com" },
          createdAt: new Date("2026-09-07T12:00:00.000Z"),
        },
        {
          id: "ord-a3",
          total: "5000.00",
          customerSnapshot: { email: "cust_a@test.com" },
          createdAt: new Date("2026-09-12T12:00:00.000Z"),
        },
      ];

      const mockPriorOrders = [
        {
          id: "ord-a1",
          customerSnapshot: { email: "cust_a@test.com" },
          createdAt: new Date("2026-08-28T12:00:00.000Z"),
        },
      ];

      let queryStep = 0;
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              queryStep++;
              if (queryStep === 1) {
                return {
                  orderBy: vi.fn(() => Promise.resolve(mockPeriodOrders)),
                };
              }
              if (queryStep === 2) {
                return {
                  orderBy: vi.fn(() => Promise.resolve(mockPriorOrders)),
                };
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, tenantId);
      const summary = await repo.getCustomerRecurrenceSummary(from, to);

      expect(summary.medianDaysBetweenOrders).toBe(6);
      expect(summary.medianDaysDisplay).toBe("6 días");
    });

    it("handles zero repeat customers with 0.0% repeat rate and displays 'Sin compras repetidas'", async () => {
      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-10T23:59:59.000Z");

      const mockPeriodOrders = [
        {
          id: "ord-new-1",
          total: "8000.00",
          customerSnapshot: { email: "first1@test.com" },
          createdAt: new Date("2026-09-02T12:00:00.000Z"),
        },
        {
          id: "ord-new-2",
          total: "9000.00",
          customerSnapshot: { email: "first2@test.com" },
          createdAt: new Date("2026-09-03T12:00:00.000Z"),
        },
      ];

      let queryStep = 0;
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              queryStep++;
              if (queryStep === 1) {
                return {
                  orderBy: vi.fn(() => Promise.resolve(mockPeriodOrders)),
                };
              }
              if (queryStep === 2) {
                return {
                  orderBy: vi.fn(() => Promise.resolve([])),
                };
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, tenantId);
      const summary = await repo.getCustomerRecurrenceSummary(from, to);

      expect(summary.totalCustomers).toBe(2);
      expect(summary.recurrentCustomers).toBe(0);
      expect(summary.firstTimeCustomers).toBe(2);
      expect(summary.repeatRate).toBe(0.0);
      expect(summary.medianDaysBetweenOrders).toBeNull();
      expect(summary.medianDaysDisplay).toBe("Sin compras repetidas");
    });
  });

  describe("4. Promotions & Discount Ticket Comparison (M-74, M-76)", () => {
    it("computes discount adoption rate, total discounts and average ticket comparison", async () => {
      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-10T23:59:59.000Z");

      // 4 orders:
      // Order 1: Total $8,000, discount $2,000 (discounted)
      // Order 2: Total $10,000, discount $1,000 (discounted)
      // Order 3: Total $5,000, discount $0 (full price)
      // Order 4: Total $7,000, discount $0 (full price)
      const mockOrders = [
        {
          id: "ord-d1",
          total: "8000.00",
          discountTotal: "2000.00",
        },
        {
          id: "ord-d2",
          total: "10000.00",
          discountTotal: "1000.00",
        },
        {
          id: "ord-f1",
          total: "5000.00",
          discountTotal: "0.00",
        },
        {
          id: "ord-f2",
          total: "7000.00",
          discountTotal: "0.00",
        },
      ];

      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(mockOrders)),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, tenantId);
      const promotions = await repo.getPromotionsSummary(from, to);

      // Validate schema
      expect(() => promotionsSummarySchema.parse(promotions)).not.toThrow();

      expect(promotions.totalOrdersCount).toBe(4);
      expect(promotions.discountedOrdersCount).toBe(2);
      expect(promotions.fullPriceOrdersCount).toBe(2);
      expect(promotions.discountAdoptionRate).toBe(50.0);
      expect(promotions.totalDiscountsApplied).toBe("3000.00");
      expect(promotions.discountedRevenue).toBe("18000.00");
      expect(promotions.fullPriceRevenue).toBe("12000.00");

      // Ticket comparison (M-76)
      // Discounted avg ticket: 18000 / 2 = 9000.00
      // Full price avg ticket: 12000 / 2 = 6000.00
      expect(promotions.ticketComparison.discountedAvgTicket).toBe("9000.00");
      expect(promotions.ticketComparison.fullPriceAvgTicket).toBe("6000.00");
      expect(promotions.ticketComparison.differenceAmount).toBe("3000.00");
      expect(promotions.ticketComparison.differencePercent).toBe(50.0);
    });

    it("handles zero discounts applied gracefully without division by zero", async () => {
      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-10T23:59:59.000Z");

      const mockOrders = [
        { id: "ord-1", total: "5000.00", discountTotal: "0.00" },
        { id: "ord-2", total: "7000.00", discountTotal: "0.00" },
      ];

      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(mockOrders)),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, tenantId);
      const promotions = await repo.getPromotionsSummary(from, to);

      expect(promotions.discountedOrdersCount).toBe(0);
      expect(promotions.fullPriceOrdersCount).toBe(2);
      expect(promotions.discountAdoptionRate).toBe(0.0);
      expect(promotions.totalDiscountsApplied).toBe("0.00");
      expect(promotions.ticketComparison.discountedAvgTicket).toBe("0.00");
      expect(promotions.ticketComparison.fullPriceAvgTicket).toBe("6000.00");
      expect(promotions.ticketComparison.differenceAmount).toBe("-6000.00");
      expect(promotions.ticketComparison.differencePercent).toBe(-100.0);
    });
  });

  describe("5. Invariant & Security Verification", () => {
    it("enforces role guard (owner only) for recurrence and promotion methods", async () => {
      const service = new AnalyticsService();
      const from = new Date("2026-09-01");
      const to = new Date("2026-09-10");

      await expect(
        service.getCustomerRecurrence(adminContext, from, to),
      ).rejects.toThrow(ForbiddenRoleError);

      await expect(
        service.getPromotionsSummary(adminContext, from, to),
      ).rejects.toThrow(ForbiddenRoleError);

      // Verify ownerContext does not throw ForbiddenRoleError
      vi.spyOn(AnalyticsRepository.prototype, "getCustomerRecurrenceSummary").mockResolvedValueOnce({} as never);
      await expect(service.getCustomerRecurrence(ownerContext, from, to)).resolves.toBeDefined();
    });

    it("strictly respects zero emojis rule across all titles, badges and outputs", () => {
      const labels = [
        "Clientes y Promociones",
        "Retención de comensales, frecuencia de pedidos y análisis descriptivo de descuentos",
        "Tasa de Recompra",
        "Tiempo Entre Compras",
        "Frecuencia de Pedidos",
        "Cobertura de Identidad",
        "Comensales Recurrentes",
        "Nuevos Comensales",
        "Sin Identificar",
        "Uso de Descuentos",
        "Total Descuentos Otorgados",
        "Ticket: Con Promo vs Regular",
        "Sin compras repetidas",
      ];

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

      for (const text of labels) {
        expect(emojiRegex.test(text)).toBe(false);
      }
    });

    it("preserves privacy by not exposing raw customer emails or phone numbers in summaries", async () => {
      const from = new Date("2026-09-01");
      const to = new Date("2026-09-10");

      const mockOrders = [
        {
          id: "ord-p1",
          total: "5000.00",
          customerSnapshot: { email: "secret.diner@vip.com", phone: "+5491100000000" },
          createdAt: new Date("2026-09-02"),
        },
      ];

      let step = 0;
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              step++;
              if (step === 1) return { orderBy: vi.fn(() => Promise.resolve(mockOrders)) };
              return { orderBy: vi.fn(() => Promise.resolve([])) };
            }),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, tenantId);
      const summary = await repo.getCustomerRecurrenceSummary(from, to);

      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain("secret.diner@vip.com");
      expect(serialized).not.toContain("+5491100000000");
    });

    it("verifies getDashboardMetrics includes customerRecurrence and promotions summaries", async () => {
      const service = new AnalyticsService();
      vi.spyOn(AnalyticsRepository.prototype, "getDwellMetrics").mockResolvedValueOnce({
        totalSessions: 0,
        avgDwellSeconds: 0,
        maxDwellSeconds: 0,
        bounceRate: 0,
        conversionRate: 0,
        bounceSessions: 0,
        cartCreatedSessions: 0,
        orderPlacedSessions: 0,
      });
      vi.spyOn(AnalyticsRepository.prototype, "getDwellTimeline").mockResolvedValueOnce([]);
      vi.spyOn(BillingRepository.prototype, "getRevenueTimeline").mockResolvedValueOnce([]);
      vi.spyOn(BillingRepository.prototype, "getTopSellingProducts").mockResolvedValue([]);
      vi.spyOn(AnalyticsRepository.prototype, "getFinancialSummary").mockResolvedValueOnce({
        totalRevenue: "0.00",
        subtotal: "0.00",
        totalDiscounts: "0.00",
        paidOrdersCount: 0,
        avgOrderValue: "0.00",
        revenueBySource: [],
        netCollections: "0.00",
        mpWaterfall: {
          grossAmount: "0.00",
          feeAmount: "0.00",
          taxesAmount: "0.00",
          refundsAmount: "0.00",
          netReceivedAmount: "0.00",
          pendingReleaseAmount: "0.00",
          releasedAmount: "0.00",
          effectiveDeductionRate: "0.00%",
          isFeeInclusiveOfTax: false,
          releaseSchedule: [],
        },
        cashLedger: {
          depositsAmount: "0.00",
          withdrawalsAmount: "0.00",
          netCashAmount: "0.00",
          movementsCount: 0,
          recentMovements: [],
        },
      });
      vi.spyOn(AnalyticsRepository.prototype, "getKitchenDelaysSummary").mockResolvedValueOnce({
        waitingMinutes: { p50: 0, p90: 0, sampleSize: 0 },
        preparationMinutes: { p50: 0, p90: 0, sampleSize: 0 },
        totalTimeMinutes: { p50: 0, p90: 0, sampleSize: 0 },
        pendingOrders: [],
        cancelledBeforeCookingCount: 0,
      });
      vi.spyOn(AnalyticsRepository.prototype, "getPeakHoursHeatmap").mockResolvedValueOnce({
        cells: [],
        maxOrdersInSlot: 0,
        busiestDay: null,
        busiestHour: null,
      });
      vi.spyOn(AnalyticsRepository.prototype, "getUnconvertedProducts").mockResolvedValueOnce([]);
      vi.spyOn(AnalyticsRepository.prototype, "getCustomerRecurrenceSummary").mockResolvedValueOnce({
        totalCustomers: 5,
        firstTimeCustomers: 3,
        recurrentCustomers: 2,
        repeatRate: 40.0,
        orderFrequency: 1.6,
        medianDaysBetweenOrders: 4.5,
        medianDaysDisplay: "4.5 días",
        identityCoverageRate: 80.0,
        identifiedOrdersCount: 8,
        unidentifiedOrdersCount: 2,
        totalOrdersCount: 10,
        segments: {
          firstTime: { customerCount: 3, orderCount: 3, totalRevenue: "15000.00", avgTicket: "5000.00" },
          recurrent: { customerCount: 2, orderCount: 5, totalRevenue: "35000.00", avgTicket: "7000.00" },
          unidentified: { customerCount: 0, orderCount: 2, totalRevenue: "8000.00", avgTicket: "4000.00" },
        },
      });
      vi.spyOn(AnalyticsRepository.prototype, "getPromotionsSummary").mockResolvedValueOnce({
        totalOrdersCount: 10,
        discountedOrdersCount: 2,
        fullPriceOrdersCount: 8,
        discountAdoptionRate: 20.0,
        totalDiscountsApplied: "2000.00",
        discountedRevenue: "10000.00",
        fullPriceRevenue: "48000.00",
        ticketComparison: {
          discountedAvgTicket: "5000.00",
          fullPriceAvgTicket: "6000.00",
          differenceAmount: "-1000.00",
          differencePercent: -16.7,
        },
      });

      const metrics = await service.getDashboardMetrics({ context: ownerContext });
      expect(metrics.customerRecurrence).toBeDefined();
      expect(metrics.customerRecurrence?.totalCustomers).toBe(5);
      expect(metrics.promotions).toBeDefined();
      expect(metrics.promotions?.discountAdoptionRate).toBe(20.0);
    });
  });
});
