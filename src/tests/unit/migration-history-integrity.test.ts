import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = new URL("../../drizzle/", import.meta.url);

function readMigration(name: string) {
  return readFileSync(fileURLToPath(new URL(name, migrationsDirectory)), "utf8");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("migration history integrity", () => {
  it("keeps the released initial migration byte-for-byte canonical", () => {
    const initialSchema = readMigration("0000_initial_schema.sql");

    expect(sha256(initialSchema)).toBe(
      "6a6b65610321ffb436562246b85fc66366b59b70253b0edce7c4ea0347fb12e8",
    );
    expect(initialSchema).not.toContain('"tender" text DEFAULT \'cash\' NOT NULL');
    expect(initialSchema).not.toContain("orders_tender_check");
  });

  it("keeps tender and register identifier in their dedicated later migrations", () => {
    const tenderMigration = readMigration("0009_add_analytics_records_and_tender.sql");
    const cashShiftMigration = readMigration("0010_schema_architecture_enhancements.sql");
    const originalCashShiftMigration = readMigration("0004_add_cash_shifts.sql");

    expect(tenderMigration).toContain(
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tender" text DEFAULT \'cash\' NOT NULL;',
    );
    expect(tenderMigration).toContain(
      'ALTER TABLE "orders" ADD CONSTRAINT "orders_tender_check" CHECK ("orders"."tender" in (\'cash\', \'posnet\'));',
    );

    expect(originalCashShiftMigration).not.toContain("register_identifier");
    expect(cashShiftMigration).toContain(
      'ALTER TABLE "cash_shifts" ADD COLUMN IF NOT EXISTS "register_identifier" text DEFAULT \'default\' NOT NULL;',
    );
    expect(cashShiftMigration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "cash_shifts_one_open_per_register_uidx" ON "cash_shifts" USING btree ("tenant_id","location_id","register_identifier") WHERE "cash_shifts"."status" = \'open\';',
    );
  });

  it("creates the order discount snapshot in a later migration", () => {
    const discountSnapshotMigration = readMigration(
      "0011_add_order_discount_snapshot.sql",
    );

    expect(discountSnapshotMigration).toContain(
      'ADD COLUMN IF NOT EXISTS "discount_snapshot" jsonb',
    );
  });

  it("creates the discount redemption audit table with tenant-scoped access", () => {
    const redemptionMigration = readMigration(
      "0012_add_discount_redemptions.sql",
    );

    expect(redemptionMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "discount_redemptions"',
    );
    expect(redemptionMigration).toContain(
      'FOREIGN KEY ("tenant_id", "discount_id")',
    );
    expect(redemptionMigration).toContain(
      'CREATE POLICY "discount_redemptions_runtime_isolation"',
    );
  });

  it("configures normalized discount junction tables and composite FKs in migration 0014", () => {
    const optimizationMigration = readMigration(
      "0014_schema_optimizations_and_normalization.sql",
    );

    expect(optimizationMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "discount_categories"',
    );
    expect(optimizationMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "discount_items"',
    );
    expect(optimizationMigration).toContain(
      'ALTER TABLE "tenant_locations"',
    );
    expect(optimizationMigration).toContain(
      'CREATE INDEX IF NOT EXISTS "tenant_locations_coords_idx"',
    );
    expect(optimizationMigration).toContain(
      'CONSTRAINT "cash_register_movements_location_fk"',
    );
  });
});
