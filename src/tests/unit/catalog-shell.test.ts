import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { TenantPresetProvider } from "@/features/tenancy/web/tenant-preset-context";
import { CatalogShell } from "@/features/tenancy/web/shells/catalog-shell";

describe("CatalogShell OCP", () => {
  it("renders catalog editor under express_retail and omits Addons/Combos tabs", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "express_retail" },
        React.createElement(CatalogShell, {
          tenantId: "t-1",
          initialCategories: [{ id: "c-1", name: "Bebidas", status: "active", version: 1 }],
          initialItems: [],
        }),
      ),
    );

    expect(html).toContain("Bebidas");
    expect(html).not.toContain("Adicionales");
    expect(html).not.toContain("Combos");
  });

  it("renders catalog editor under gastronomy and includes Addons and Combos tabs", () => {
    const html = renderToString(
      React.createElement(
        TenantPresetProvider,
        { preset: "gastronomy" },
        React.createElement(CatalogShell, {
          tenantId: "t-1",
          initialCategories: [{ id: "c-1", name: "Pizzas", status: "active", version: 1 }],
          initialItems: [],
        }),
      ),
    );

    expect(html).toContain("Pizzas");
    expect(html).toContain("Adicionales");
    expect(html).toContain("Combos");
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
            { preset: "unsupported_model" },
            React.createElement(CatalogShell, {
              tenantId: "t-1",
              initialCategories: [],
              initialItems: [],
            }),
          ),
        );
      }).toThrow("[CatalogShell] Preset no soportado: unsupported_model");
    } finally {
      console.error = originalError;
    }
  });
});
