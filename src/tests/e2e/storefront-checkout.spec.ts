import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  acceptanceEnabled,
  arrangeTenantPair,
  createCart,
  createPublishedCatalog,
  setTenantOperational,
} from "./support/acceptance";

test.describe("storefront checkout", () => {
  test.skip(
    !acceptanceEnabled,
    "Requires E2E_MULTITENANT_READY=1 and an isolated migrated database.",
  );

  test("isolates A/B carts, rejects stale checkout and hides suspended tenants", async ({
    page,
  }) => {
    const pair = await arrangeTenantPair(page.request, "storefront");
    const catalogA = await createPublishedCatalog(
      page.request,
      pair.tenantA,
      "Storefront A",
    );
    const catalogB = await createPublishedCatalog(
      page.request,
      pair.tenantB,
      "Storefront B",
    );
    await setTenantOperational(pair.tenantA.id);
    await setTenantOperational(pair.tenantB.id);

    const cartA = await createCart(
      page.request,
      pair.tenantA,
      catalogA.item.id,
    );
    await createCart(page.request, pair.tenantB, catalogB.item.id);

    const foreignCart = await page.request.get(
      `/api/v1/storefronts/${pair.tenantB.slug}/carts/${cartA.id}`,
    );
    expect(foreignCart.status()).toBe(404);

    const changed = await page.request.patch(
      `/api/v1/tenants/${pair.tenantA.id}/catalog/items/${catalogA.item.id}`,
      {
        headers: { "If-Match": String(catalogA.item.version) },
        data: { price: "4100.00" },
      },
    );
    expect(changed.ok()).toBe(true);

    const staleCheckout = await page.request.post(
      `/api/v1/storefronts/${pair.tenantA.slug}/carts/${cartA.id}/payment-sessions`,
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          customer: { name: "Cliente A" },
          cartVersion: cartA.version,
        },
      },
    );
    expect(staleCheckout.status()).toBe(409);

    await page.setExtraHTTPHeaders({
      "x-forwarded-host": `${pair.tenantA.slug}.localhost:3000`,
    });
    await page.goto("/order");
    await expect(page.getByText("Producto Storefront A")).toBeVisible();
    await expect(page.getByText("Producto Storefront B")).toHaveCount(0);

    await setTenantOperational(pair.tenantB.id, { active: false });
    const suspended = await page.request.get(
      `/api/v1/storefronts/${pair.tenantB.slug}/catalog`,
    );
    expect(suspended.status()).toBe(404);
  });
});
