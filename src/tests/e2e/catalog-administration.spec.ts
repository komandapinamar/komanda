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
    await page
      .getByRole("button", { name: "Agregar categoría", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Publicar categoría", exact: true })
      .click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "Categoría publicada",
    );

    await page.getByRole("button", { name: "+ Nuevo producto" }).click();
    const productDialog = page.getByRole("dialog", { name: "Nuevo producto" });
    await productDialog.getByLabel("Nombre").fill(itemA);
    await productDialog.getByPlaceholder("3500,50").fill("3500");
    await productDialog.locator("select").selectOption({
      label: categoryA,
    });
    await productDialog
      .getByRole("button", { name: "Guardar producto" })
      .click();
    await page
      .getByRole("article")
      .filter({ hasText: itemA })
      .getByRole("button", { name: "Publicar" })
      .click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "Producto publicado",
    );

    await page.goto(`/admin/${pair.tenantB.id}/catalog`);
    await expect(page.getByText(categoryA)).toHaveCount(0);
    await expect(page.getByText(itemA)).toHaveCount(0);
    await page.getByPlaceholder("Nueva categoría").fill(categoryB);
    await page
      .getByRole("button", { name: "Agregar categoría", exact: true })
      .click();
    await expect(page.getByText(categoryB, { exact: true })).toBeVisible();

    await page.goto(`/admin/${pair.tenantA.id}/catalog`);
    await expect(page.getByText(categoryA, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("article").filter({ hasText: itemA }),
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
