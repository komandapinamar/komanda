import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTableConfig } from "drizzle-orm/pg-core";
import { tenants } from "@/db/schema/platform";
import { TenantSettingsPanel } from "@/features/tenancy/web/TenantSettingsPanel";

describe("Tenant Preset & Backoffice Adaptive Architecture", () => {
  it("defines the preset column with default 'gastronomy' and check constraint in tenants table", () => {
    const config = getTableConfig(tenants);
    const presetCol = config.columns.find((col) => col.name === "preset");

    expect(presetCol).toBeDefined();
    expect(presetCol?.default).toBe("gastronomy");
    expect(presetCol?.notNull).toBe(true);

    const presetCheck = config.checks.find(
      (check) => check.name === "tenants_preset_check",
    );
    expect(presetCheck).toBeDefined();
  });

  it("renders the TenantSettingsPanel with the operational preset selector", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TenantSettingsPanel, {
        initialSettings: {
          tenantId: "11111111-1111-4111-8111-111111111111",
          contactName: "Luka",
          contactEmail: "luka@komanda.com",
          contactPhone: null,
          salesEnabled: true,
          printingEnabled: false,
          preset: "express_retail",
          currency: "ARS",
          timezone: "America/Argentina/Buenos_Aires",
          version: 1,
        },
      }),
    );

    expect(markup).toContain("Perfil operativo del negocio");
    expect(markup).toContain("Gastronomía (Komanda POS)");
    expect(markup).toContain("Autoservicio / Kiosco (Komanda Kiosk)");
    expect(markup).toContain('value="express_retail"');
    expect(markup).toContain('value="gastronomy"');
    expect(markup).not.toContain("Tema del menú digital (QR)");
    expect(markup).not.toContain('name="menuTheme"');

    const gastronomyMarkup = renderToStaticMarkup(
      React.createElement(TenantSettingsPanel, {
        initialSettings: {
          tenantId: "11111111-1111-4111-8111-111111111111",
          contactName: "Luka",
          contactEmail: "luka@komanda.com",
          contactPhone: null,
          salesEnabled: true,
          printingEnabled: false,
          preset: "gastronomy",
          menuTheme: "reels",
          currency: "ARS",
          timezone: "America/Argentina/Buenos_Aires",
          version: 1,
        },
      }),
    );

    expect(gastronomyMarkup).toContain("Tema del menú digital (QR)");
    expect(gastronomyMarkup).toContain('name="menuTheme"');
    expect(gastronomyMarkup).toContain('checked="" value="reels"');
  });
});
