import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

describe("catalog administration producer contract", () => {
  it("publishes tenant-scoped category, item, add-on, combo and media operations", async () => {
    const document = parse(
      await readFile(
        resolve(process.cwd(), "../specs/001-multi-tenant-base/contracts/openapi.yaml"),
        "utf8",
      ),
    ) as { paths: Record<string, Record<string, unknown>> };

    const operations = [
      ["/api/v1/tenants/{tenantId}/catalog/categories", "get"],
      ["/api/v1/tenants/{tenantId}/catalog/categories", "post"],
      ["/api/v1/tenants/{tenantId}/catalog/categories/{categoryId}", "patch"],
      ["/api/v1/tenants/{tenantId}/catalog/categories/{categoryId}", "delete"],
      ["/api/v1/tenants/{tenantId}/catalog/items", "get"],
      ["/api/v1/tenants/{tenantId}/catalog/items", "post"],
      ["/api/v1/tenants/{tenantId}/catalog/items/{itemId}", "patch"],
      ["/api/v1/tenants/{tenantId}/catalog/items/{itemId}", "delete"],
      ["/api/v1/tenants/{tenantId}/catalog/addon-groups", "post"],
      ["/api/v1/tenants/{tenantId}/catalog/addon-groups/{addonGroupId}", "patch"],
      ["/api/v1/tenants/{tenantId}/catalog/combos", "post"],
      ["/api/v1/tenants/{tenantId}/catalog/combos/{comboId}", "patch"],
      ["/api/v1/tenants/{tenantId}/media/uploads", "post"],
      ["/api/v1/tenants/{tenantId}/media/{assetId}/complete", "post"],
    ] as const;
    for (const [path, method] of operations) {
      expect(document.paths[path]?.[method]).toBeDefined();
    }
  });
});
