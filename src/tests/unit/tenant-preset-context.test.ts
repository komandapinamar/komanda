import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  TenantPresetProvider,
  useTenantPreset,
} from "@/features/tenancy/web/tenant-preset-context";
import { AdminNavShell } from "@/features/tenancy/web/shells/admin-nav-shell";

function TestConsumer() {
  const { preset, isExpressRetail, isGastronomy } = useTenantPreset();
  return React.createElement(
    "div",
    null,
    React.createElement("span", { id: "p" }, preset),
    React.createElement("span", { id: "e" }, isExpressRetail ? "yes" : "no"),
    React.createElement("span", { id: "g" }, isGastronomy ? "yes" : "no"),
  );
}

describe("TenantPresetContext & AdminNavShell", () => {
  it("provides correct values for express_retail", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "express_retail" },
        React.createElement(TestConsumer),
      ),
    );
    expect(html).toContain("express_retail");
    expect(html).toContain("yes");
  });

  it("provides correct values for gastronomy", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "gastronomy" },
        React.createElement(TestConsumer),
      ),
    );
    expect(html).toContain("gastronomy");
  });

  it("throws when useTenantPreset is rendered outside Provider", () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => {
        renderToString(React.createElement(TestConsumer));
      }).toThrow("useTenantPreset must be used within a TenantPresetProvider");
    } finally {
      console.error = originalError;
    }
  });

  it("AdminNavShell renders Catálogo Retail and Ventas / Kiosk for express_retail", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "express_retail" },
        React.createElement(AdminNavShell, {
          tenantId: "t-1",
          role: "owner",
          switchBusiness: React.createElement("span", null, "Cambiar"),
        }),
      ),
    );
    expect(html).toContain("Catálogo Retail");
    expect(html).toContain("Ventas / Kiosk");
    expect(html).not.toContain("Pedidos");
  });

  it("AdminNavShell renders Pedidos and Catálogo for gastronomy", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "gastronomy" },
        React.createElement(AdminNavShell, {
          tenantId: "t-1",
          role: "owner",
          switchBusiness: React.createElement("span", null, "Cambiar"),
        }),
      ),
    );
    expect(html).toContain("Pedidos");
    expect(html).toContain("Catálogo");
    expect(html).not.toContain("Catálogo Retail");
    expect(html).not.toContain("Ventas / Kiosk");
  });

  it("AdminNavShell throws explicit error for unhandled preset (OCP requirement)", () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => {
        renderToString(
          React.createElement(
            TenantPresetProvider,
            // @ts-expect-error Testing invalid runtime preset
            { preset: "unsupported_rubro" },
            React.createElement(AdminNavShell, {
              tenantId: "t-1",
              role: "owner",
              switchBusiness: null,
            }),
          ),
        );
      }).toThrow("[AdminNavShell] Preset no soportado: unsupported_rubro");
    } finally {
      console.error = originalError;
    }
  });
});
