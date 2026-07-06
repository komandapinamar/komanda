import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("storefront cart tenant isolation", () => {
  it("uses tenant-composite catalog and cart relationships with forced RLS", async () => {
    const migration = await readFile("drizzle/0007_multitenant_carts.sql", "utf8");
    for (const table of ["carts", "cart_lines", "cart_line_options"]) {
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain(
      'FOREIGN KEY ("tenant_id", "item_id") REFERENCES "catalog_items"("tenant_id", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("tenant_id", "cart_id") REFERENCES "carts"("tenant_id", "id")',
    );
  });
});
