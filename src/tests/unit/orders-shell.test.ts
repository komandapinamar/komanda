import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { TenantPresetProvider } from "@/features/tenancy/web/tenant-preset-context";
import { OrdersShell } from "@/features/tenancy/web/shells/orders-shell";

describe("OrdersShell OCP", () => {
  it("renders Express sales summaries and the same operational stages as POS", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "express_retail" },
        React.createElement(OrdersShell, {
          tenantId: "t-1",
          initialOrders: [],
        }),
      ),
    );

    expect(html).toContain("Total Facturado");
    expect(html).toContain("Cobros Digitales");
    expect(html).not.toContain("Preparando");
    expect(html).toContain("1. Pago");
    expect(html).toContain("2. Cocina");
    expect(html).toContain("3. Entrega");
  });

  it("renders AdminOrdersLive for gastronomy with kitchen statuses", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "gastronomy" },
        React.createElement(OrdersShell, {
          tenantId: "t-1",
          initialOrders: [],
        }),
      ),
    );

    expect(html).toContain("Activos");
    expect(html).toContain("esperando entrega");
    expect(html).not.toContain("Ventas por Kiosk");
  });

  it("throws an explicit error on unhandled preset", () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => {
        renderToString(
          React.createElement(
            TenantPresetProvider,
            // @ts-expect-error Testing invalid runtime preset
            { preset: "unsupported_retail" },
            React.createElement(OrdersShell, {
              tenantId: "t-1",
              initialOrders: [],
            }),
          ),
        );
      }).toThrow("[OrdersShell] Preset no soportado: unsupported_retail");
    } finally {
      console.error = originalError;
    }
  });
});
