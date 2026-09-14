import { expect, test } from "@playwright/test";
import {
  acceptanceEnabled,
  arrangeTenantPair,
  createCart,
  createDirectOrder,
  createPublishedCatalog,
  setTenantOperational,
} from "./support/acceptance";

test.describe("tenant order dashboard", () => {
  test.skip(
    !acceptanceEnabled,
    "Requires E2E_MULTITENANT_READY=1 and an isolated migrated database.",
  );

  test("operates A/B orders, denies foreign IDs and recovers the event stream", async ({
    page,
  }) => {
    const pair = await arrangeTenantPair(page.request, "orders");
    const catalogA = await createPublishedCatalog(page.request, pair.tenantA, "Order A");
    const catalogB = await createPublishedCatalog(page.request, pair.tenantB, "Order B");
    await setTenantOperational(pair.tenantA.id);
    await setTenantOperational(pair.tenantB.id);
    const cartA = await createCart(page.request, pair.tenantA, catalogA.item.id);
    const cartB = await createCart(page.request, pair.tenantB, catalogB.item.id);
    const orderA = await createDirectOrder(
      page.request,
      pair.tenantA,
      cartA.id,
      "Cliente A",
    );
    const orderB = await createDirectOrder(
      page.request,
      pair.tenantB,
      cartB.id,
      "Cliente B",
    );

    const foreign = await page.request.get(
      `/api/v1/tenants/${pair.tenantA.id}/orders/${orderB.id}`,
    );
    expect(foreign.status()).toBe(404);

    await page.goto(`/admin/${pair.tenantA.id}/orders`);
    await expect(
      page.getByText(`Pedido interno: ${orderA.id}`),
    ).toBeVisible();
    await expect(page.getByText(orderB.id)).toHaveCount(0);
    await expect(page.getByText("Conexion En vivo")).toBeVisible();

    await page.getByRole("button", { name: "Preparar" }).click();
    await expect(page.getByText("Estado: En preparación")).toBeVisible();
    const current = await page.request.get(
      `/api/v1/tenants/${pair.tenantA.id}/orders/${orderA.id}`,
    );
    const currentOrder = (await current.json()) as { version: number };

    await page.reload();
    await expect(page.getByText("Conexion En vivo")).toBeVisible();
    const transition = await page.request.patch(
      `/api/v1/tenants/${pair.tenantA.id}/orders/${orderA.id}`,
      {
        headers: { "If-Match": String(currentOrder.version) },
        data: { fulfillmentStatus: "ready" },
      },
    );
    expect(transition.ok()).toBe(true);
    await expect(page.getByText("Estado: Listo")).toBeVisible({ timeout: 10_000 });
  });
});
