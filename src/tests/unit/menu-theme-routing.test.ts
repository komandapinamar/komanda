import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTableConfig } from "drizzle-orm/pg-core";

const { mockHeaders } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
  runtimePool: {},
}));

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { tenantSettings } from "@/db/schema/platform";
import { catalogItems } from "@/db/schema/catalog";
import {
  getMenuItems,
  getTenantMenuTheme,
} from "@/features/shop/menu/services/menu.service";
import {
  PublicTenantNotFoundError,
  PublicTenantService,
} from "@/features/tenancy/application/public-tenant.service";
import Order from "@/app/(shop)/order/page";
import ClassicMenuView from "@/features/shop/menu/components/ClassicMenuView";
import ReelsMenuView from "@/features/shop/reels/components/ReelsMenuView";
import { TenantSettingsPanel } from "@/features/tenancy/web/TenantSettingsPanel";
import { TenantSettingsService } from "@/features/tenancy/application/tenant-settings.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import { db } from "@/db";

type CatalogResult = Awaited<ReturnType<PublicTenantService["catalog"]>>;

function createMockCatalog(overrides?: {
  menuTheme?: "classic" | "reels";
  categories?: CatalogResult["categories"];
  tenantName?: string;
  tenantSlug?: string;
}): CatalogResult {
  const theme = overrides?.menuTheme ?? "reels";
  const slug = overrides?.tenantSlug ?? "mi-resto";
  const name = overrides?.tenantName ?? "Mi Resto";
  return {
    tenant: {
      name,
      slug,
      currency: "ARS",
      menuTheme: theme,
    },
    menuTheme: theme,
    revision: 1,
    categories: overrides?.categories ?? [],
  };
}

describe("Menu Theme & Video Asset Foundation (Epic 1)", () => {
  describe("Database Schema Invariants", () => {
    it("configures menuTheme column and check constraint on tenantSettings", () => {
      const config = getTableConfig(tenantSettings);
      const menuThemeCol = config.columns.find((col) => col.name === "menu_theme");

      expect(menuThemeCol).toBeDefined();
      expect(menuThemeCol?.notNull).toBe(true);
      expect(menuThemeCol?.default).toBe("classic");

      const menuThemeCheck = config.checks.find(
        (chk) => chk.name === "tenant_settings_menu_theme_check",
      );
      expect(menuThemeCheck).toBeDefined();
    });

    it("configures optional videoAssetId column and foreign key on catalogItems", () => {
      const config = getTableConfig(catalogItems);
      const videoAssetCol = config.columns.find(
        (col) => col.name === "video_asset_id",
      );

      expect(videoAssetCol).toBeDefined();
      expect(videoAssetCol?.notNull).toBe(false);

      const videoFk = config.foreignKeys.find(
        (fk) => fk.getName() === "catalog_items_video_media_fk",
      );
      expect(videoFk).toBeDefined();
    });
  });

  describe("Menu Service & Catalog DTO Mapping", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("maps videoUrl correctly when item has video and media is ready", async () => {
      vi.spyOn(PublicTenantService.prototype, "catalog").mockResolvedValue(
        createMockCatalog({
          menuTheme: "reels",
          tenantSlug: "burger-spot",
          tenantName: "Burger Spot",
          categories: [
            {
              id: "cat-1",
              name: "Burgers",
              items: [
                {
                  id: "item-1",
                  tenantId: "tenant-1",
                  categoryId: "cat-1",
                  name: "Smash Burger",
                  normalizedName: "smash-burger",
                  description: "Doble carne con queso",
                  price: "12000.00",
                  currency: "ARS",
                  imageAssetId: "img-1",
                  videoAssetId: "vid-1",
                  status: "active",
                  sortOrder: 0,
                  version: 1,
                  archivedAt: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  imageUrl: "https://cdn.komanda.app/images/smash.jpg",
                  videoUrl: "https://cdn.komanda.app/videos/smash.mp4",
                  addonGroups: [],
                },
              ],
              combos: [],
            },
          ],
        }),
      );

      const items = await getMenuItems("burger-spot");
      expect(items).toHaveLength(1);
      expect(items[0].videoUrl).toBe("https://cdn.komanda.app/videos/smash.mp4");
      expect(items[0].image).toBe("https://cdn.komanda.app/images/smash.jpg");
    });

    it("assigns videoUrl: null when item has no video asset", async () => {
      vi.spyOn(PublicTenantService.prototype, "catalog").mockResolvedValue(
        createMockCatalog({
          menuTheme: "classic",
          tenantSlug: "burger-spot",
          tenantName: "Burger Spot",
          categories: [
            {
              id: "cat-1",
              name: "Bebidas",
              items: [
                {
                  id: "item-2",
                  tenantId: "tenant-1",
                  categoryId: "cat-1",
                  name: "Gaseosa",
                  normalizedName: "gaseosa",
                  description: "Lata 354ml",
                  price: "3000.00",
                  currency: "ARS",
                  imageAssetId: "img-2",
                  videoAssetId: null,
                  status: "active",
                  sortOrder: 0,
                  version: 1,
                  archivedAt: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  imageUrl: "https://cdn.komanda.app/images/coke.jpg",
                  videoUrl: null,
                  addonGroups: [],
                },
              ],
              combos: [],
            },
          ],
        }),
      );

      const items = await getMenuItems("burger-spot");
      expect(items).toHaveLength(1);
      expect(items[0].videoUrl).toBeNull();
      expect(items[0].image).toBe("https://cdn.komanda.app/images/coke.jpg");
    });

    it("resolves tenant menu theme correctly with getTenantMenuTheme", async () => {
      const catalogSpy = vi.spyOn(PublicTenantService.prototype, "catalog");

      catalogSpy.mockResolvedValueOnce(createMockCatalog({ menuTheme: "reels" }));
      const themeReels = await getTenantMenuTheme("t1");
      expect(themeReels).toBe("reels");

      catalogSpy.mockResolvedValueOnce(createMockCatalog({ menuTheme: "classic" }));
      const themeClassic = await getTenantMenuTheme("t2");
      expect(themeClassic).toBe("classic");
    });
  });

  describe("SSR Strategy Pattern in /order/page.tsx", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      mockHeaders.mockResolvedValue(
        new Headers([["x-komanda-tenant-slug", "mi-resto"]]),
      );
    });

    it("renders ReelsMenuView when menu_theme is 'reels'", async () => {
      vi.spyOn(PublicTenantService.prototype, "catalog").mockResolvedValue(
        createMockCatalog({
          menuTheme: "reels",
          categories: [
            {
              id: "cat-1",
              name: "Reels Cat",
              items: [],
              combos: [],
            },
          ],
        }),
      );

      const element = await Order();

      expect(element).toBeDefined();
      expect(element.type).toBe(ReelsMenuView);
      expect(element.props.categories).toBeDefined();
      expect(element.props.items).toBeDefined();
      expect(element.type).not.toBe(ClassicMenuView);
    });

    it("renders ClassicMenuView when menu_theme is 'classic'", async () => {
      vi.spyOn(PublicTenantService.prototype, "catalog").mockResolvedValue(
        createMockCatalog({
          menuTheme: "classic",
          categories: [
            {
              id: "cat-1",
              name: "Classic Cat",
              items: [],
              combos: [],
            },
          ],
        }),
      );

      const element = await Order();

      expect(element).toBeDefined();
      expect(element.type).toBe(ClassicMenuView);
      expect(element.props.categories).toBeDefined();
      expect(element.props.items).toBeDefined();
      expect(element.type).not.toBe(ReelsMenuView);
    });

    it("triggers notFound when tenant slug header is missing", async () => {
      mockHeaders.mockResolvedValue(new Headers());

      await expect(Order()).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("triggers notFound when tenant is not found", async () => {
      vi.spyOn(PublicTenantService.prototype, "catalog").mockRejectedValue(
        new PublicTenantNotFoundError("Not found"),
      );

      await expect(Order()).rejects.toThrow("NEXT_NOT_FOUND");
    });
  });

  describe("Tenant Settings Menu Theme Configuration (FR-8)", () => {
    it("renders TenantSettingsPanel with menu theme options", () => {
      const html = renderToStaticMarkup(
        React.createElement(TenantSettingsPanel, {
          initialSettings: {
            tenantId: "tenant-123",
            contactName: "Dueño",
            contactEmail: "dueno@resto.com",
            contactPhone: "+541112345678",
            salesEnabled: true,
            printingEnabled: false,
            menuTheme: "reels",
            currency: "ARS",
            timezone: "America/Argentina/Buenos_Aires",
            version: 1,
          },
        }),
      );

      expect(html).toContain("Tema del menú digital");
      expect(html).toContain('name="menuTheme"');
      expect(html).toContain('value="classic"');
      expect(html).toContain('value="reels"');
      expect(html).toContain('checked="" value="reels"');
    });

    it("validates and accepts valid menuTheme in TenantSettingsService update", async () => {
      const service = new TenantSettingsService();
      const mockContext = createVerifiedTenantContext({
        tenantId: "tenant-123",
        correlationId: "corr-1",
        source: "administrative",
        actor: {
          kind: "user",
          userId: "user-1",
          membershipId: "mem-1",
          role: "owner",
        },
      });

      const mockTx = {
        execute: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          {
            tenantId: "tenant-123",
            contactName: "Dueño",
            contactEmail: "dueno@resto.com",
            contactPhone: "+541112345678",
            salesEnabled: true,
            printingEnabled: false,
            menuTheme: "reels",
            version: 2,
          },
        ]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: "tenant-123",
            defaultCurrency: "ARS",
            defaultTimezone: "America/Argentina/Buenos_Aires",
          },
        ]),
      };

      vi.mocked(db.transaction).mockImplementation(async (cb) =>
        cb(mockTx as unknown as Parameters<typeof cb>[0]),
      );

      const result = await service.update(mockContext, 1, {
        menuTheme: "reels",
      });

      expect(result.menuTheme).toBe("reels");
      expect(result.version).toBe(2);
    });

    it("rejects invalid menuTheme in TenantSettingsService update", () => {
      const service = new TenantSettingsService();
      const mockContext = createVerifiedTenantContext({
        tenantId: "tenant-123",
        correlationId: "corr-1",
        source: "administrative",
        actor: {
          kind: "user",
          userId: "user-1",
          membershipId: "mem-1",
          role: "owner",
        },
      });

      expect(() =>
        service.update(mockContext, 1, {
          menuTheme: "invalid-theme" as unknown as "classic",
        }),
      ).toThrow();
    });
  });
});
