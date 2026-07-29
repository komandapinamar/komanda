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

  it("resolves the storefront slug before tenant-scoped cart reads", async () => {
    const service = await readFile("features/cart/application/cart.service.ts", "utf8");
    expect(service).toContain("const tenant = await this.tenants.resolve(slug)");
    expect(service).toContain("withTenantTransaction(publicContext(tenant)");
    expect(service).toContain(
      "new CartRepository(transaction, tenant.id).find(cartId)",
    );
  });

  it("keeps checkout validation on the explicit tenant slug", async () => {
    const checkout = await readFile("app/(shop)/checkout/pay/page.tsx", "utf8");
    expect(checkout).toContain("tenantSlug");
    expect(checkout).toContain("getCart(tenantSlug, effectiveCartId)");
    expect(checkout).not.toContain("getCart(effectiveCartId)");
  });
});
