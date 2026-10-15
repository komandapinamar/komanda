import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/t-1/settings",
}));

import { TenantPresetProvider } from "@/features/tenancy/web/tenant-preset-context";
import { AnalyticsShell } from "@/features/tenancy/web/shells/analytics-shell";
import { SettingsShell } from "@/features/tenancy/web/shells/settings-shell";
import type { DashboardAnalyticsData } from "@/features/analytics/web/analytics-types";
import type { TenantSettingsView } from "@/features/tenancy/web/TenantSettingsPanel";

const dummyAnalyticsData = {
  dateRange: { from: "2026-10-01", to: "2026-10-04", granularity: "day" },
  dwell: {
    totalSessions: 100,
    avgDwellSeconds: 20,
    maxDwellSeconds: 60,
    bounceSessions: 10,
    cartCreatedSessions: 30,
    orderPlacedSessions: 20,
    bounceRate: 10,
    conversionRate: 20,
  },
  dwellTimeline: [],
  topProducts: { byQuantity: [], byRevenue: [] },
  revenueTimeline: [],
  financial: {
    totalRevenue: "1000",
    subtotal: "1000",
    totalDiscounts: "0",
    paidOrdersCount: 10,
    avgOrderValue: "100",
    revenueBySource: [],
  },
  customerRecurrence: {
    newCustomersCount: 5,
    recurringCustomersCount: 5,
    recurrenceRatePercentage: 50,
    segments: {
      unidentified: { orderCount: 0, revenue: "0" },
      new: { orderCount: 5, revenue: "500" },
      recurring: { orderCount: 5, revenue: "500" },
      loyal: { orderCount: 0, revenue: "0" },
    },
  },
} as unknown as DashboardAnalyticsData;

const dummySettings: TenantSettingsView = {
  tenantId: "t-1",
  contactName: "Admin",
  contactEmail: "admin@test.com",
  contactPhone: "123456",
  salesEnabled: true,
  printingEnabled: false,
  currency: "ARS",
  timezone: "America/Argentina/Buenos_Aires",
  version: 1,
};

describe("AnalyticsShell & SettingsShell OCP", () => {
  it("AnalyticsShell renders without errors under express_retail", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "express_retail" },
        React.createElement(AnalyticsShell, {
          tenantId: "t-1",
          initialData: dummyAnalyticsData,
        }),
      ),
    );
    expect(html).toBeDefined();
  });

  it("AnalyticsShell throws on unhandled preset", () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => {
        renderToString(
          React.createElement(
            TenantPresetProvider,
            // @ts-expect-error Testing invalid runtime preset
            { preset: "unsupported" },
            React.createElement(AnalyticsShell, {
              tenantId: "t-1",
              initialData: dummyAnalyticsData,
            }),
          ),
        );
      }).toThrow("[AnalyticsShell] Preset no soportado: unsupported");
    } finally {
      console.error = originalError;
    }
  });

  it("SettingsShell renders without errors under express_retail", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "express_retail" },
        React.createElement(SettingsShell, {
          initialSettings: dummySettings,
        }),
      ),
    );
    expect(html).toBeDefined();
    expect(html).toContain("Guardar configuración");
    expect(html).toContain("Autoservicio / Kiosco (Komanda Kiosk)");
  });

  it("SettingsShell throws on unhandled preset", () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => {
        renderToString(
          React.createElement(
            TenantPresetProvider,
            // @ts-expect-error Testing invalid runtime preset
            { preset: "unsupported" },
            React.createElement(SettingsShell, {
              initialSettings: dummySettings,
            }),
          ),
        );
      }).toThrow("[SettingsShell] Preset no soportado: unsupported");
    } finally {
      console.error = originalError;
    }
  });
});
