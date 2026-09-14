import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const databaseTest = process.env.DATABASE_TEST_INTEGRATION === "1" ? it : it.skip;

describe("catalog tenant isolation", () => {
  it("declares tenant-composite relationships, optimistic versions and forced RLS", async () => {
    const migration = await readFile(
      "drizzle/0000_initial_schema.sql",
      "utf8",
    );
    for (const table of [
      "media_assets",
      "catalog_categories",
      "catalog_items",
      "addon_groups",
      "addon_options",
      "item_addon_groups",
      "catalog_combos",
      "combo_items",
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain(
      'FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."catalog_categories"("tenant_id","id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id")',
    );
    expect(migration).toContain('"version" integer DEFAULT 1 NOT NULL');
  });

  databaseTest(
    "rejects known foreign ids, mixed-tenant relationships and stale versions",
    async () => {
      const directUrl = process.env.DATABASE_DIRECT_URL;
      if (!directUrl) throw new Error("DATABASE_DIRECT_URL is required.");
      const owner = new Pool({ connectionString: directUrl, max: 1 });
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const suffix = randomUUID();
      const { CatalogConflictError, CatalogNotFoundError, CatalogService } =
        await import("@/features/catalog/application/catalog.service");
      const { createVerifiedTenantContext } = await import(
        "@/lib/tenant-context/types"
      );
      try {
        await owner.query(
          `insert into tenants (id, name, slug, normalized_slug)
           values ($1, 'Catalog A', $3, $3), ($2, 'Catalog B', $4, $4)`,
          [tenantA, tenantB, `catalog-a-${suffix}`, `catalog-b-${suffix}`],
        );
        await owner.query(
          `insert into tenant_entitlement_snapshots
             (tenant_id, plan_id, plan_version, entitlements, source_request_id)
           values
             ($1, 'development', 1, '{"catalog_management":true,"online_payments":true,"printing":true}'::jsonb, $3),
             ($2, 'development', 1, '{"catalog_management":true,"online_payments":true,"printing":true}'::jsonb, $4)`,
          [tenantA, tenantB, `catalog-a-${suffix}`, `catalog-b-${suffix}`],
        );
        const contextA = createVerifiedTenantContext({
          tenantId: tenantA,
          correlationId: randomUUID(),
          source: "administrative",
          actor: { kind: "service", serviceId: "catalog-isolation-test" },
        });
        const contextB = createVerifiedTenantContext({
          tenantId: tenantB,
          correlationId: randomUUID(),
          source: "administrative",
          actor: { kind: "service", serviceId: "catalog-isolation-test" },
        });
        const service = new CatalogService();
        const categoryA = await service.createCategory(contextA, {
          name: "A",
          sortOrder: 0,
          status: "active",
        });
        const categoryB = await service.createCategory(contextB, {
          name: "B",
          sortOrder: 0,
          status: "active",
        });

        await expect(
          service.updateCategory(contextA, categoryB.id, {
            name: "foreign",
            version: categoryB.version,
          }),
        ).rejects.toBeInstanceOf(CatalogNotFoundError);
        await expect(
          service.createItem(contextA, {
            categoryId: categoryB.id,
            name: "Mixed tenant item",
            price: "10.00",
            currency: "ARS",
            status: "draft",
            sortOrder: 0,
            addonGroupIds: [],
          }),
        ).rejects.toBeInstanceOf(CatalogNotFoundError);

        await service.updateCategory(contextA, categoryA.id, {
          name: "A updated",
          version: categoryA.version,
        });
        await expect(
          service.updateCategory(contextA, categoryA.id, {
            name: "stale overwrite",
            version: categoryA.version,
          }),
        ).rejects.toBeInstanceOf(CatalogConflictError);
      } finally {
        await owner.end();
      }
    },
    60_000,
  );
});
