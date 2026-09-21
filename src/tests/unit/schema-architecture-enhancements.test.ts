import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
  runtimePool: {},
}));

import { getTableConfig } from "drizzle-orm/pg-core";
import {
  billingDocuments,
  carts,
  cashRegisterMovements,
  cashShifts,
  catalogCategories,
  catalogItems,
  inventoryLevels,
  inventoryMovements,
  printerDestinations,
  tenantLocations,
  tenantPrintJobs,
} from "@/db/schema";
import {
  EXPECTED_PROTECTED_TABLES,
  REQUIRED_TENANT_NOT_NULL_TABLES,
} from "@/scripts/verify-database-roles";

describe("Schema Architecture Enhancements", () => {
  describe("Mejora 1: Multi-Location Inventory Ledger", () => {
    it("configures inventory_levels table correctly with location & item isolation", () => {
      const config = getTableConfig(inventoryLevels);
      const cols = config.columns.map((c) => c.name);

      expect(cols).toContain("tenant_id");
      expect(cols).toContain("location_id");
      expect(cols).toContain("item_id");
      expect(cols).toContain("available_quantity");
      expect(cols).toContain("reserved_quantity");

      const uidx = config.indexes.find(
        (i) => (i as { config?: { name?: string } }).config?.name === "inventory_levels_location_item_uidx",
      );
      expect(uidx).toBeDefined();

      const fks = config.foreignKeys.map((fk) => fk.getName());
      expect(fks).toContain("inventory_levels_tenant_fk");
      expect(fks).toContain("inventory_levels_location_fk");
      expect(fks).toContain("inventory_levels_item_fk");
    });

    it("configures inventory_movements append-only ledger correctly", () => {
      const config = getTableConfig(inventoryMovements);
      const cols = config.columns.map((c) => c.name);

      expect(cols).toContain("tenant_id");
      expect(cols).toContain("location_id");
      expect(cols).toContain("item_id");
      expect(cols).toContain("quantity_delta");
      expect(cols).toContain("reason");
      expect(cols).toContain("reference_order_id");

      const reasonCheck = config.checks.find(
        (c) => c.name === "inventory_movements_reason_check",
      );
      expect(reasonCheck).toBeDefined();
    });
  });

  describe("Mejora 2: Multi-Register Cash Shifts and Movements", () => {
    it("allows multiple open shifts across distinct registers/locations", () => {
      const config = getTableConfig(cashShifts);
      const cols = config.columns.map((c) => c.name);

      expect(cols).toContain("register_identifier");
      expect(cols).toContain("location_id");

      const registerUidx = config.indexes.find(
        (i) => (i as { config?: { name?: string } }).config?.name === "cash_shifts_one_open_per_register_uidx",
      );
      expect(registerUidx).toBeDefined();
    });

    it("supports extended cash movement types without requiring orderId for drops/floats", () => {
      const config = getTableConfig(cashRegisterMovements);
      const cols = config.columns.map((c) => c.name);

      expect(cols).toContain("shift_id");
      expect(cols).toContain("reason");

      const orderCol = config.columns.find((c) => c.name === "order_id");
      expect(orderCol?.notNull).toBe(false);

      const typeCheck = config.checks.find(
        (c) => c.name === "cash_movements_type_check",
      );
      expect(typeCheck).toBeDefined();
    });
  });

  describe("Mejora 3: Printing Destinations & Station Routing", () => {
    it("configures printer_destinations table with hardware connection types", () => {
      const config = getTableConfig(printerDestinations);
      const cols = config.columns.map((c) => c.name);

      expect(cols).toContain("name");
      expect(cols).toContain("station_type");
      expect(cols).toContain("connection_type");
      expect(cols).toContain("ip_address");
      expect(cols).toContain("port");
      expect(cols).toContain("is_active");
    });

    it("associates print_jobs with destinationStationId and stationType", () => {
      const config = getTableConfig(tenantPrintJobs);
      const cols = config.columns.map((c) => c.name);

      expect(cols).toContain("destination_station_id");
      expect(cols).toContain("station_type");
    });

    it("adds destinationStation routing to categories and items", () => {
      const catCols = getTableConfig(catalogCategories).columns.map((c) => c.name);
      const itemCols = getTableConfig(catalogItems).columns.map((c) => c.name);

      expect(catCols).toContain("destination_station");
      expect(itemCols).toContain("destination_station");
    });
  });

  describe("Mejora 4: Fiscal ARCA/AFIP Credit/Debit Notes & VAT Breakdown", () => {
    it("supports relatedDocumentId, vatBreakdown and credit notes", () => {
      const config = getTableConfig(billingDocuments);
      const cols = config.columns.map((c) => c.name);

      expect(cols).toContain("related_document_id");
      expect(cols).toContain("vat_breakdown");

      const docCheck = config.checks.find(
        (c) => c.name === "billing_documents_document_type_check",
      );
      expect(docCheck).toBeDefined();
    });
  });

  describe("Mejora 5: Row-Level Security Protected Table Inventory", () => {
    it("tracks all operational tables in protected tables lists", () => {
      expect(EXPECTED_PROTECTED_TABLES).toContain("inventory_levels");
      expect(EXPECTED_PROTECTED_TABLES).toContain("inventory_movements");
      expect(EXPECTED_PROTECTED_TABLES).toContain("printer_destinations");
      expect(EXPECTED_PROTECTED_TABLES).toContain("cash_shifts");
      expect(EXPECTED_PROTECTED_TABLES).toContain("discounts");
      expect(EXPECTED_PROTECTED_TABLES).toContain("discount_categories");
      expect(EXPECTED_PROTECTED_TABLES).toContain("discount_items");

      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("inventory_levels");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("inventory_movements");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("printer_destinations");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("cash_shifts");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("discounts");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("discount_categories");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("discount_items");
    });
  });

  describe("Mejora 6: Index Coverage & Composite FK Consistency", () => {
    it("configures location latitude, longitude and coords index on tenant_locations", () => {
      const config = getTableConfig(tenantLocations);
      const cols = config.columns.map((c) => c.name);
      expect(cols).toContain("latitude");
      expect(cols).toContain("longitude");

      const coordsIdx = config.indexes.find(
        (i) => (i as { config?: { name?: string } }).config?.name === "tenant_locations_coords_idx" ||
               (i as { name?: string }).name === "tenant_locations_coords_idx",
      );
      expect(coordsIdx).toBeDefined();
    });

    it("configures foreign key indexes for carts, inventory movements, and billing documents", () => {
      const cartsConfig = getTableConfig(carts);
      const discountIdx = cartsConfig.indexes.find(
        (i) => (i as { config?: { name?: string } }).config?.name === "carts_tenant_discount_idx" ||
               (i as { name?: string }).name === "carts_tenant_discount_idx",
      );
      expect(discountIdx).toBeDefined();

      const invConfig = getTableConfig(inventoryMovements);
      const orderIdx = invConfig.indexes.find(
        (i) => (i as { config?: { name?: string } }).config?.name === "inventory_movements_tenant_order_idx" ||
               (i as { name?: string }).name === "inventory_movements_tenant_order_idx",
      );
      expect(orderIdx).toBeDefined();

      const billConfig = getTableConfig(billingDocuments);
      const locIssuedIdx = billConfig.indexes.find(
        (i) => (i as { config?: { name?: string } }).config?.name === "billing_documents_tenant_location_issued_idx" ||
               (i as { name?: string }).name === "billing_documents_tenant_location_issued_idx",
      );
      expect(locIssuedIdx).toBeDefined();
    });

    it("configures composite tenant foreign keys on cash_register_movements", () => {
      const config = getTableConfig(cashRegisterMovements);
      const fks = config.foreignKeys.map((fk) => fk.getName());

      expect(fks).toContain("cash_register_movements_tenant_fk");
      expect(fks).toContain("cash_register_movements_location_fk");
      expect(fks).toContain("cash_register_movements_shift_fk");
      expect(fks).toContain("cash_register_movements_order_fk");

      const uidx = config.uniqueConstraints.find(
        (u) => u.name === "cash_register_movements_tenant_id_id_key",
      );
      expect(uidx).toBeDefined();
    });
  });
});
