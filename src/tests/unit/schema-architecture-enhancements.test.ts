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
  cashRegisterMovements,
  cashShifts,
  catalogCategories,
  catalogItems,
  inventoryLevels,
  inventoryMovements,
  printerDestinations,
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

      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("inventory_levels");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("inventory_movements");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("printer_destinations");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("cash_shifts");
      expect(REQUIRED_TENANT_NOT_NULL_TABLES).toContain("discounts");
    });
  });
});
