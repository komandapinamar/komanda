import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  acceptanceEnabled,
  arrangeTenantPair,
  createCart,
  createDirectOrder,
  createPublishedCatalog,
  expirePrintLease,
  setTenantOperational,
} from "./support/acceptance";

test.describe("tenant printing", () => {
  test.skip(
    !acceptanceEnabled,
    "Requires E2E_MULTITENANT_READY=1 and an isolated migrated database.",
  );

  test("recovers an abandoned lease, applies one result and rejects a revoked token", async ({
    page,
  }) => {
    const pair = await arrangeTenantPair(page.request, "printing");
    const catalog = await createPublishedCatalog(page.request, pair.tenantA, "Print A");
    await setTenantOperational(pair.tenantA.id, { printing: true });

    await page.goto(`/admin/${pair.tenantA.id}/integrations/printing`);
    await page.getByRole("button", { name: "Enrolar agente" }).click();
    await expect(page.getByRole("status")).toContainText("Agente enrolado");
    const token = await page.locator("textarea[readonly]").inputValue();

    const cart = await createCart(page.request, pair.tenantA, catalog.item.id);
    await createDirectOrder(page.request, pair.tenantA, cart.id, "Cliente Print");
    const firstClaim = await page.request.post("/api/v1/print/jobs/claim", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(firstClaim.ok()).toBe(true);
    const abandoned = (await firstClaim.json()) as {
      job: { id: string; attemptNumber: number };
    };

    await expirePrintLease(abandoned.job.id);
    const recoveredClaim = await page.request.post("/api/v1/print/jobs/claim", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(recoveredClaim.ok()).toBe(true);
    const recovered = (await recoveredClaim.json()) as {
      job: { id: string; attemptNumber: number };
    };
    expect(recovered.job.id).toBe(abandoned.job.id);
    expect(recovered.job.attemptNumber).toBe(abandoned.job.attemptNumber + 1);

    const resultKey = randomUUID();
    const resultBody = {
      status: "printed",
      attemptNumber: recovered.job.attemptNumber,
    };
    const firstResult = await page.request.post(
      `/api/v1/print/jobs/${recovered.job.id}/result`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": resultKey,
        },
        data: resultBody,
      },
    );
    const repeatedResult = await page.request.post(
      `/api/v1/print/jobs/${recovered.job.id}/result`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": resultKey,
        },
        data: resultBody,
      },
    );
    expect(firstResult.ok()).toBe(true);
    expect(repeatedResult.ok()).toBe(true);
    expect(await repeatedResult.json()).toEqual(await firstResult.json());

    await page.getByRole("button", { name: "Revocar agente" }).click();
    await expect(page.getByRole("status")).toContainText("Agente revocado");
    const denied = await page.request.post("/api/v1/print/jobs/claim", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(denied.status()).toBe(404);
  });
});
