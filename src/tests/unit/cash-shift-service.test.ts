import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
  runtimePool: {},
}));

import { getTableConfig } from "drizzle-orm/pg-core";
import { cashShifts } from "@/db/schema/commerce";
import {
  CashShiftConflictError,
  CashShiftNotFoundError,
  CashShiftService,
} from "@/features/commerce/application/cash-shift.service";

describe("Epic 4: Cash Shifts & Arqueo Architecture", () => {
  describe("Schema Invariants", () => {
    it("defines cash_shifts table with strict constraints and single open shift unique index", () => {
      const config = getTableConfig(cashShifts);
      const colNames = config.columns.map((c) => c.name);

      expect(colNames).toContain("tenant_id");
      expect(colNames).toContain("opening_balance");
      expect(colNames).toContain("closing_balance");
      expect(colNames).toContain("expected_cash");
      expect(colNames).toContain("status");
      expect(colNames).toContain("opened_at");
      expect(colNames).toContain("closed_at");

      const statusCheck = config.checks.find(
        (c) => c.name === "cash_shifts_status_check",
      );
      expect(statusCheck).toBeDefined();

      const openingCheck = config.checks.find(
        (c) => c.name === "cash_shifts_opening_balance_check",
      );
      expect(openingCheck).toBeDefined();

      const singleOpenUidx = config.indexes.find(
        (idx) =>
          (idx as { config?: { name?: string } }).config?.name ===
            "cash_shifts_one_open_per_tenant_uidx" ||
          (idx as { name?: string }).name === "cash_shifts_one_open_per_tenant_uidx",
      );
      expect(singleOpenUidx).toBeDefined();
    });
  });

  describe("Domain Exceptions", () => {
    it("exports CashShiftConflictError and CashShiftNotFoundError", () => {
      const conflict = new CashShiftConflictError("Ya existe un turno abierto");
      const notFound = new CashShiftNotFoundError("Turno no encontrado");

      expect(conflict).toBeInstanceOf(Error);
      expect(notFound).toBeInstanceOf(Error);
      expect(conflict.message).toBe("Ya existe un turno abierto");
      expect(notFound.message).toBe("Turno no encontrado");
    });
  });
});
