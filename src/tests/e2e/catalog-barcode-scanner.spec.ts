import { expect, test } from "@playwright/test";
import { acceptanceEnabled, arrangeTenantPair, createPublishedCatalog, setTenantPreset } from "./support/acceptance";

test("offers camera scanning only in mobile Express Retail and keeps manual saving available", async ({ page }) => {
  test.skip(!acceptanceEnabled, "Requires an isolated, migrated acceptance database.");
  const pair = await arrangeTenantPair(page.request, "barcode");
  const { tenantA: retail, tenantB: gastronomy } = pair;
  await setTenantPreset(retail.id, "express_retail");
  await createPublishedCatalog(page.request, retail, "Retail");
  await createPublishedCatalog(page.request, gastronomy, "Gastronomía");

  await page.goto(`/admin/${retail.id}/catalog`);
  await page.getByRole("button", { name: "+ Nuevo producto" }).click();
  await expect(page.getByRole("button", { name: "Escanear código" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPhone)" });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "+ Nuevo producto" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo producto" });
  await dialog.getByLabel("Nombre").fill("Producto con código manual");
  await dialog.getByLabel("Precio").fill("950");
  const barcode = dialog.getByLabel("Código de barras", { exact: true });
  await barcode.fill("0012345678905");
  await dialog.getByRole("button", { name: "Escanear código" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Revisá los permisos");
  await expect(barcode).toHaveValue("0012345678905");
  await expect(dialog.getByLabel("Nombre")).toHaveValue("Producto con código manual");

  const saved = page.waitForResponse((response) =>
    response.url().endsWith(`/tenants/${retail.id}/catalog/items`) &&
    response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Guardar producto" }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({ barcode: "0012345678905" });

  await page.goto(`/admin/${gastronomy.id}/catalog`);
  await page.getByRole("button", { name: "+ Nuevo producto" }).click();
  await expect(page.getByRole("button", { name: "Escanear código" })).toHaveCount(0);
});
