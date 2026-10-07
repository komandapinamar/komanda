import { describe, expect, it, vi } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { getTableConfig } from "drizzle-orm/pg-core";
import { ZodError } from "zod";
import { discounts } from "@/db/schema/discounts";
import {
  ApplicableTenderSchema,
  CreateDiscountSchema,
  UpdateDiscountSchema,
  formatDiscountOutput,
} from "@/features/discounts/domain/discount.schemas";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import { AdminDiscountsPanel } from "@/features/discounts/web/AdminDiscountsPanel";
import type { TenantTransaction } from "@/db/tenant-transaction";
import type { DiscountRow } from "@/features/discounts/infrastructure/discount.repository";

const tenantId = "00000000-0000-4000-8000-000000000001";

function buildRow(overrides: Partial<DiscountRow> = {}): DiscountRow {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    tenantId,
    code: "EFECTIVO10",
    name: "Promo efectivo",
    description: null,
    discountType: "percentage",
    discountValue: "10.00",
    minOrderAmount: "0",
    maxRedemptions: null,
    redemptionsCount: 0,
    startsAt: new Date(),
    endsAt: null,
    scope: "global",
    applicableTender: "cash",
    targetCategoryIds: [],
    targetItemIds: [],
    isActive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("Story 4.1: Applicable Tender On Discounts", () => {
  describe("Schema & Migration", () => {
    it("defines applicable_tender column with default", () => {
      const config = getTableConfig(discounts);
      const col = config.columns.find((c) => c.name === "applicable_tender");
      expect(col).toBeDefined();
      expect(col?.notNull).toBe(true);
    });

    it("defines the check constraint enforcing all|cash", () => {
      const config = getTableConfig(discounts);
      const check = config.checks.find(
        (c) => c.name === "discounts_applicable_tender_check",
      );
      expect(check).toBeDefined();
    });

    it("migration 0023 adds the column with default 'all' and the check constraint", () => {
      const sql = readFileSync(
        fileURLToPath(
          new URL("../../drizzle/0023_add_discount_applicable_tender.sql", import.meta.url),
        ),
        "utf8",
      );
      expect(sql).toContain(
        'ALTER TABLE "discounts" ADD COLUMN IF NOT EXISTS "applicable_tender" text DEFAULT \'all\' NOT NULL',
      );
      expect(sql).toContain('"discounts_applicable_tender_check"');
      expect(sql).toContain('in (\'all\', \'cash\')');
    });
  });

  describe("Zod Schemas (API)", () => {
    it("ApplicableTenderSchema accepts all and cash, rejects crypto", () => {
      expect(ApplicableTenderSchema.parse("all")).toBe("all");
      expect(ApplicableTenderSchema.parse("cash")).toBe("cash");
      expect(() => ApplicableTenderSchema.parse("crypto")).toThrow(ZodError);
    });

    it("CreateDiscountSchema defaults applicableTender to 'all' and accepts 'cash'", () => {
      const base = {
        code: "PROMO",
        name: "Promo",
        discountType: "percentage" as const,
        discountValue: "10",
      };
      const defaulted = CreateDiscountSchema.parse(base);
      expect(defaulted.applicableTender).toBe("all");

      const cashed = CreateDiscountSchema.parse({ ...base, applicableTender: "cash" });
      expect(cashed.applicableTender).toBe("cash");

      expect(() =>
        CreateDiscountSchema.parse({ ...base, applicableTender: "crypto" }),
      ).toThrow(ZodError);
    });

    it("UpdateDiscountSchema accepts applicableTender when provided", () => {
      expect(UpdateDiscountSchema.parse({ applicableTender: "cash" }).applicableTender).toBe("cash");
      expect(() => UpdateDiscountSchema.parse({ applicableTender: "posnet" })).toThrow(ZodError);
    });

    it("formatDiscountOutput propagates applicableTender", () => {
      const output = formatDiscountOutput(buildRow({ applicableTender: "cash" }));
      expect(output.applicableTender).toBe("cash");
    });
  });

  describe("DiscountRepository", () => {
    it("persists applicableTender on create", async () => {
      let insertedValues: Record<string, unknown> | null = null;
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((val) => {
            insertedValues = val;
            return {
              returning: vi.fn().mockResolvedValue([
                { ...buildRow(), ...val, createdAt: new Date(), updatedAt: new Date() },
              ]),
            };
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new DiscountRepository(mockTx, tenantId);
      const result = await repo.create({
        code: "PROMO",
        name: "Promo",
        discountType: "percentage",
        discountValue: "10.00",
        applicableTender: "cash",
      });

      expect(insertedValues).toMatchObject({ applicableTender: "cash" });
      expect(result.applicableTender).toBe("cash");
    });

    it("defaults applicableTender to 'all' on create", async () => {
      let insertedValues: Record<string, unknown> | null = null;
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((val) => {
            insertedValues = val;
            return {
              returning: vi.fn().mockResolvedValue([
                { ...buildRow(), ...val, createdAt: new Date(), updatedAt: new Date() },
              ]),
            };
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new DiscountRepository(mockTx, tenantId);
      await repo.create({
        code: "PROMO",
        name: "Promo",
        discountType: "percentage",
        discountValue: "10.00",
      });

      expect(insertedValues).toMatchObject({ applicableTender: "all" });
    });

    it("sets applicableTender on update", async () => {
      let setValues: Record<string, unknown> | null = null;
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((val) => {
            setValues = val;
            return {
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([buildRow({ applicableTender: "cash" })]),
              }),
            };
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new DiscountRepository(mockTx, tenantId);
      const updated = await repo.update(
        "00000000-0000-4000-8000-000000000099",
        { applicableTender: "cash" },
      );

      expect(setValues).toMatchObject({ applicableTender: "cash" });
      expect(updated?.applicableTender).toBe("cash");
    });
  });

  describe("AdminDiscountsPanel", () => {
    it("renders the 'Exclusivo Efectivo' badge for cash-only coupons", () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDiscountsPanel, {
          tenantId,
          initialDiscounts: [formatDiscountOutput(buildRow({ applicableTender: "cash" }))],
        }),
      );
      expect(html).toContain("Exclusivo Efectivo");
    });

    it("does not render the badge for universal coupons", () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDiscountsPanel, {
          tenantId,
          initialDiscounts: [formatDiscountOutput(buildRow({ applicableTender: "all" }))],
        }),
      );
      expect(html).not.toContain("Exclusivo Efectivo");
    });
  });
});
