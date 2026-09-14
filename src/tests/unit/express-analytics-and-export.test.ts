import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExpressRetailPanel from "@/features/analytics/web/components/ExpressRetailPanel";
import type { DashboardAnalyticsData } from "@/features/analytics/web/analytics-types";

describe("Epic 6: Express Analytics & CSV Export", () => {
  const mockData: DashboardAnalyticsData = {
    dateRange: {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-15T23:59:59.000Z",
      granularity: "day",
    },
    dwell: {
      totalSessions: 120,
      avgDwellSeconds: 45,
      maxDwellSeconds: 180,
      bounceSessions: 10,
      cartCreatedSessions: 80,
      orderPlacedSessions: 60,
      bounceRate: 8.3,
      conversionRate: 50.0,
    },
    dwellTimeline: [],
    financial: {
      totalRevenue: "150000.00",
      subtotal: "150000.00",
      totalDiscounts: "0.00",
      paidOrdersCount: 45,
      avgOrderValue: "3333.33",
      revenueBySource: [],
      cashLedger: {
        depositsAmount: "50000.00",
        withdrawalsAmount: "0.00",
        netCashAmount: "50000.00",
        movementsCount: 15,
        recentMovements: [],
      },
    },
    revenueTimeline: [],
    topProducts: {
      byQuantity: [
        {
          productName: "Coca-Cola 500ml",
          sourceItemId: "item-1",
          sourceComboId: null,
          categoryName: "Bebidas",
          totalQuantity: 25,
          totalRevenue: "37500.00",
        },
      ],
      byRevenue: [],
    },
    tenderBreakdown: [
      { tender: "cash", revenue: "85000.00", ordersCount: 25 },
      { tender: "posnet", revenue: "65000.00", ordersCount: 20 },
    ],
    currentCashShift: {
      id: "shift-123",
      openingBalance: "10000.00",
      expectedCash: "95000.00",
      currentCashSales: "85000.00",
      status: "open",
      openedAt: "2026-09-15T08:00:00.000Z",
    },
  };

  it("renders ExpressRetailPanel with open shift and tender breakdown", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ExpressRetailPanel, { data: mockData }),
    );

    expect(markup).toContain("Komanda Kiosk");
    expect(markup).toContain("Total en Caja Hoy");
    expect(markup).toContain("Turno Abierto");
    expect(markup).toContain("Cobros en Efectivo");
    expect(markup).toContain("Tarjetas / Digital");
    expect(markup).toContain("25 pedidos");
    expect(markup).toContain("20 pedidos");
  });

  it("renders closed cash state when currentCashShift is null", () => {
    const closedData: DashboardAnalyticsData = {
      ...mockData,
      currentCashShift: null,
    };

    const markup = renderToStaticMarkup(
      React.createElement(ExpressRetailPanel, { data: closedData }),
    );

    expect(markup).toContain("Caja Cerrada");
    expect(markup).toContain("Iniciá turno desde Komanda Kiosk");
  });
});
