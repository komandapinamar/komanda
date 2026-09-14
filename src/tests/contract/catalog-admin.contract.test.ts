import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("catalog administration producer contract", () => {
  it("has implemented route adapters for catalog administration operations", async () => {
    const [categoriesRoute, itemsRoute, addonGroupsRoute, combosRoute, uploadsRoute] =
      await Promise.all([
        readFile("app/api/v1/tenants/[tenantId]/catalog/categories/route.ts", "utf8"),
        readFile("app/api/v1/tenants/[tenantId]/catalog/items/route.ts", "utf8"),
        readFile("app/api/v1/tenants/[tenantId]/catalog/addon-groups/route.ts", "utf8"),
        readFile("app/api/v1/tenants/[tenantId]/catalog/combos/route.ts", "utf8"),
        readFile("app/api/v1/tenants/[tenantId]/media/uploads/route.ts", "utf8"),
      ]);

    expect(categoriesRoute).toContain("GET");
    expect(categoriesRoute).toContain("POST");
    expect(itemsRoute).toContain("GET");
    expect(itemsRoute).toContain("POST");
    expect(addonGroupsRoute).toContain("POST");
    expect(combosRoute).toContain("POST");
    expect(uploadsRoute).toContain("POST");
  });
});
