import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
  runtimePool: {},
}));

import { getTableConfig } from "drizzle-orm/pg-core";
import { catalogItems, globalProductCatalog } from "@/db/schema/catalog";
import { catalogItemInputSchema } from "@/features/catalog/domain/catalog.rules";
import { BarcodeLookupService } from "@/features/catalog/application/barcode-lookup.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

describe("Epic 2: Barcode, Generic Products & Atomic Stock", () => {
  describe("Schema Invariants", () => {
    it("defines barcode, is_generic, generic_icon, track_stock, and stock_quantity on catalog_items", () => {
      const config = getTableConfig(catalogItems);
      const colNames = config.columns.map((c) => c.name);

      expect(colNames).toContain("barcode");
      expect(colNames).toContain("is_generic");
      expect(colNames).toContain("generic_icon");
      expect(colNames).toContain("track_stock");
      expect(colNames).toContain("stock_quantity");

      const stockCheck = config.checks.find(
        (c) => c.name === "catalog_items_stock_quantity_check",
      );
      expect(stockCheck).toBeDefined();

      const barcodeUidx = config.indexes.find(
        (idx) => (idx as { config?: { name?: string } }).config?.name === "catalog_items_tenant_barcode_uidx" || (idx as { name?: string }).name === "catalog_items_tenant_barcode_uidx",
      );
      expect(barcodeUidx).toBeDefined();
    });

    it("defines global_product_catalog table for central caching", () => {
      const config = getTableConfig(globalProductCatalog);
      const colNames = config.columns.map((c) => c.name);

      expect(colNames).toContain("barcode");
      expect(colNames).toContain("name");
      expect(colNames).toContain("suggested_category");
      expect(colNames).toContain("image_url");
      expect(colNames).toContain("brand");
    });
  });

  describe("Validation Rules (catalogItemInputSchema)", () => {
    const baseValidItem = {
      categoryId: "00000000-0000-4000-8000-000000000001",
      name: "Alfajor Havanna",
      price: "2500.00",
      currency: "ARS",
      status: "draft" as const,
      sortOrder: 0,
      addonGroupIds: [],
    };

    it("accepts a barcode and stock tracking fields", () => {
      const parsed = catalogItemInputSchema.parse({
        ...baseValidItem,
        barcode: "7790895000997",
        trackStock: true,
        stockQuantity: 15,
      });

      expect(parsed.barcode).toBe("7790895000997");
      expect(parsed.trackStock).toBe(true);
      expect(parsed.stockQuantity).toBe(15);
      expect(parsed.isGeneric).toBe(false);
    });

    it("accepts a generic product with a tactile icon", () => {
      const parsed = catalogItemInputSchema.parse({
        ...baseValidItem,
        name: "Café Espresso Doble",
        isGeneric: true,
        genericIcon: "☕",
        barcode: null,
      });

      expect(parsed.isGeneric).toBe(true);
      expect(parsed.genericIcon).toBe("☕");
      expect(parsed.barcode).toBeNull();
    });

    it("rejects negative stock quantities", () => {
      expect(() =>
        catalogItemInputSchema.parse({
          ...baseValidItem,
          trackStock: true,
          stockQuantity: -5,
        }),
      ).toThrow();
    });
  });

  describe("BarcodeLookupService", () => {
    const mockContext = createVerifiedTenantContext({
      tenantId: "11111111-1111-4111-8111-111111111111",
      correlationId: "test-corr-id",
      source: "administrative",
      actor: { kind: "user", userId: "usr-1", role: "owner", membershipId: "mem-1" },
    });

    it("returns source: 'none' for empty or blank barcode", async () => {
      const service = new BarcodeLookupService();
      const result = await service.lookup(mockContext, "   ");
      expect(result).toEqual({ source: "none", suggestion: null });
    });
  });
});
