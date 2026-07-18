import { expect, test } from "@playwright/test";
import {
  acceptanceEnabled,
  arrangeTenantPair,
  setTenantOperational,
} from "./support/acceptance";

test.describe("catalog administration", () => {
  test.skip(
    !acceptanceEnabled,
    "Requires E2E_MULTITENANT_READY=1 and an isolated migrated database.",
  );

  test("publishes independent first-use catalogs for tenants A and B", async ({
    page,
  }) => {
    const pair = await arrangeTenantPair(page.request, "catalog");
    const categoryA = `Hamburguesas A ${Date.now()}`;
    const itemA = `Producto A ${Date.now()}`;
    const categoryB = `Hamburguesas B ${Date.now()}`;

    await page.goto(`/admin/${pair.tenantA.id}/catalog`);
    await page.getByPlaceholder("Nueva categoría").fill(categoryA);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    const categoryRow = page.getByRole("listitem").filter({ hasText: categoryA });
    await categoryRow.getByRole("button", { name: "Publicar" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "Recurso publicado",
    );

    await page.getByPlaceholder("Producto").fill(itemA);
    await page.getByPlaceholder("3500.00").first().fill("3500.00");
    await page.locator('select[name="categoryId"]').first().selectOption({
      label: categoryA,
    });
    await page.getByRole("button", { name: "Agregar producto" }).click();
    const itemRow = page.getByRole("listitem").filter({ hasText: itemA });
    await itemRow.getByRole("button", { name: "Publicar" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "Recurso publicado",
    );

    await page.goto(`/admin/${pair.tenantB.id}/catalog`);
    await expect(page.getByText(categoryA)).toHaveCount(0);
    await expect(page.getByText(itemA)).toHaveCount(0);
    await page.getByPlaceholder("Nueva categoría").fill(categoryB);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: categoryB }),
    ).toBeVisible();

    await page.goto(`/admin/${pair.tenantA.id}/catalog`);
    await expect(
      page.getByRole("listitem").filter({ hasText: categoryA }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: itemA }),
    ).toBeVisible();
    await expect(page.getByText(categoryB)).toHaveCount(0);

    await setTenantOperational(pair.tenantA.id);
    const publicCatalog = await page.request.get(
      `/api/v1/storefronts/${pair.tenantA.slug}/catalog`,
    );
    expect(publicCatalog.ok()).toBe(true);
    expect(await publicCatalog.text()).toContain(itemA);
  });
});
