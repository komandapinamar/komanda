import { describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { discounts } from "@/db/schema/discounts";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import type { TenantTransaction } from "@/db/tenant-transaction";

describe("Story 1.1: Discounts Schema & Repository", () => {
  describe("Schema Invariants (getTableConfig)", () => {
    it("defines all required columns on discounts table", () => {
      const config = getTableConfig(discounts);
      const colNames = config.columns.map((c) => c.name);

      expect(colNames).toContain("id");
      expect(colNames).toContain("tenant_id");
      expect(colNames).toContain("code");
      expect(colNames).toContain("name");
      expect(colNames).toContain("description");
      expect(colNames).toContain("discount_type");
      expect(colNames).toContain("discount_value");
      expect(colNames).toContain("min_order_amount");
      expect(colNames).toContain("max_redemptions");
      expect(colNames).toContain("redemptions_count");
      expect(colNames).toContain("starts_at");
      expect(colNames).toContain("ends_at");
      expect(colNames).toContain("scope");
      expect(colNames).toContain("target_category_ids");
      expect(colNames).toContain("target_item_ids");
      expect(colNames).toContain("is_active");
      expect(colNames).toContain("version");
      expect(colNames).toContain("created_at");
      expect(colNames).toContain("updated_at");
      expect(colNames).toContain("deleted_at");
    });

    it("defines composite unique constraint on (tenant_id, code)", () => {
      const config = getTableConfig(discounts);
      const uniqueConstraint = config.uniqueConstraints.find(
        (u) => u.name === "discounts_tenant_code_key",
      );
      expect(uniqueConstraint).toBeDefined();
      const colNames = uniqueConstraint?.columns.map((c) => c.name);
      expect(colNames).toContain("tenant_id");
      expect(colNames).toContain("code");
    });

    it("defines check constraints for valid types, scopes, positive values, bounds and version", () => {
      const config = getTableConfig(discounts);
      const checkNames = config.checks.map((c) => c.name);

      expect(checkNames).toContain("discounts_type_check");
      expect(checkNames).toContain("discounts_scope_check");
      expect(checkNames).toContain("discounts_value_positive_check");
      expect(checkNames).toContain("discounts_percentage_bounds_check");
      expect(checkNames).toContain("discounts_dates_order_check");
      expect(checkNames).toContain("discounts_redemptions_bounds_check");
      expect(checkNames).toContain("discounts_version_positive_check");
    });

    it("defines foreign key to tenants table", () => {
      const config = getTableConfig(discounts);
      const fk = config.foreignKeys.find((f) => f.getName() === "discounts_tenant_fk");
      expect(fk).toBeDefined();
    });

    it("defines index on (tenant_id, is_active, starts_at, ends_at)", () => {
      const config = getTableConfig(discounts);
      const idx = config.indexes.find(
        (i) => (i as { config?: { name?: string } }).config?.name === "discounts_tenant_active_idx" ||
               (i as { name?: string }).name === "discounts_tenant_active_idx",
      );
      expect(idx).toBeDefined();
    });
  });

  describe("DiscountRepository Unit Tests", () => {
    const tenantId = "00000000-0000-4000-8000-000000000001";

    it("normalizes code to uppercase on creation", async () => {
      let insertedValues: Record<string, unknown> | null = null;

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((val) => {
            insertedValues = val;
            return {
              returning: vi.fn().mockResolvedValue([
                {
                  id: "00000000-0000-4000-8000-000000000099",
                  ...val,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ]),
            };
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new DiscountRepository(mockTx, tenantId);
      const result = await repo.create({
        code: "  verano2026  ",
        name: "Promo Verano",
        discountType: "percentage",
        discountValue: "20.00",
        minOrderAmount: "5000.00",
        scope: "global",
      });

      expect(result.code).toBe("VERANO2026");
      expect(insertedValues).toMatchObject({
        tenantId,
        code: "VERANO2026",
        name: "Promo Verano",
        discountType: "percentage",
        discountValue: "20.00",
        version: 1,
      });
    });

    it("finds by normalized code and returns record", async () => {
      const expectedDiscount = {
        id: "00000000-0000-4000-8000-000000000099",
        tenantId,
        code: "VERANO2026",
        name: "Promo Verano",
        discountType: "percentage" as const,
        discountValue: "20.00",
        minOrderAmount: "5000.00",
        maxRedemptions: 50,
        redemptionsCount: 0,
        startsAt: new Date(),
        endsAt: null,
        scope: "global" as const,
        targetCategoryIds: [],
        targetItemIds: [],
        isActive: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([expectedDiscount]),
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new DiscountRepository(mockTx, tenantId);
      const result = await repo.findByCode("verano2026");

      expect(result).toEqual(expectedDiscount);
      expect(mockTx.select).toHaveBeenCalled();
    });

    it("throws an error when creating a discount with empty or whitespace-only code", async () => {
      const mockTx = {} as TenantTransaction;
      const repo = new DiscountRepository(mockTx, tenantId);

      await expect(
        repo.create({
          code: "   ",
          name: "Invalid",
          discountType: "percentage",
          discountValue: "10.00",
        }),
      ).rejects.toThrow("Discount code cannot be empty.");
    });

    it("returns null or false safely when invalid UUID is passed to findById, update or softDelete", async () => {
      const mockTx = {} as TenantTransaction;
      const repo = new DiscountRepository(mockTx, tenantId);

      const byId = await repo.findById("not-a-uuid");
      expect(byId).toBeNull();

      const byCodeEmpty = await repo.findByCode("   ");
      expect(byCodeEmpty).toBeNull();

      const updated = await repo.update("not-a-uuid", { name: "New Name" });
      expect(updated).toBeNull();

      const deleted = await repo.softDelete("not-a-uuid");
      expect(deleted).toBe(false);
    });

    it("soft deletes a discount by setting deleted_at and incrementing version", async () => {
      const validDiscountId = "00000000-0000-4000-8000-000000000099";
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: validDiscountId }]),
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new DiscountRepository(mockTx, tenantId);
      const success = await repo.softDelete(validDiscountId);

      expect(success).toBe(true);
      expect(mockTx.update).toHaveBeenCalledWith(discounts);
    });
  });
});
