import { describe, expect, it } from "vitest";
import {
  CatalogRuleViolationError,
  assertAddonSelectionBounds,
  assertArchivableCategory,
  assertPublishableCombo,
  assertPublishableItem,
} from "@/features/catalog/domain/catalog.rules";
import {
  EntitlementDeniedError,
  EntitlementService,
} from "@/features/provisioning/application/entitlement.service";

describe("catalog business rules", () => {
  it("rejects invalid add-on bounds and selections", () => {
    expect(() =>
      assertAddonSelectionBounds({ minSelected: 2, maxSelected: 1, selected: 1 }),
    ).toThrow(CatalogRuleViolationError);
    expect(() =>
      assertAddonSelectionBounds({ minSelected: 1, maxSelected: 2, selected: 3 }),
    ).toThrow(CatalogRuleViolationError);
  });

  it("requires complete active relationships before publication", () => {
    expect(() =>
      assertPublishableItem({ categoryStatus: "archived", mediaStatus: "ready" }),
    ).toThrow(CatalogRuleViolationError);
    expect(() =>
      assertPublishableCombo({
        categoryStatus: "active",
        mediaStatus: "ready",
        items: [],
      }),
    ).toThrow(CatalogRuleViolationError);
    expect(() =>
      assertPublishableCombo({
        categoryStatus: "active",
        mediaStatus: "ready",
        items: [{ status: "archived", quantity: 1 }],
      }),
    ).toThrow(CatalogRuleViolationError);
  });

  it("archives categories only after sellable children are removed", () => {
    expect(() => assertArchivableCategory({ sellableChildren: 1 })).toThrow(
      CatalogRuleViolationError,
    );
    expect(() => assertArchivableCategory({ sellableChildren: 0 })).not.toThrow();
  });

  it("denies catalog management when the immutable snapshot is absent or disabled", async () => {
    const service = new EntitlementService({
      findActivePlan: async () => null,
      findCurrentSnapshot: async () => ({
        entitlements: {
          catalog_management: false,
          online_payments: true,
          printing: true,
        },
      }),
    });
    await expect(
      service.require("00000000-0000-4000-8000-000000000001", "catalog_management"),
    ).rejects.toBeInstanceOf(EntitlementDeniedError);
  });
});
