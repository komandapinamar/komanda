import { expect, test } from "@playwright/test";
import {
  acceptanceEnabled,
  arrangeTenantPair,
} from "./support/acceptance";
import {
  mockProvisioningIdempotencyKey,
  mockProvisioningRequest,
} from "@/tests/fixtures/mock-provisioning";

test.describe("provisioning and onboarding", () => {
  test.skip(
    !acceptanceEnabled,
    "Requires E2E_MULTITENANT_READY=1 and an isolated migrated database.",
  );

  test("verifies one owner, switches A/B context and keeps sales disabled", async (
    { page },
    testInfo,
  ) => {
    if (testInfo.project.name === "tenant-a") {
      const mockBootstrap = await page.request.post(
        "/api/v1/provisioning/tenants",
        {
          headers: {
            Authorization: `Bearer ${process.env.KOMANDA_BUSINESS_SERVICE_TOKEN}`,
            "Idempotency-Key": mockProvisioningIdempotencyKey,
          },
          data: mockProvisioningRequest,
        },
      );
      expect(mockBootstrap.status()).toBe(201);
      const mockTenant = (await mockBootstrap.json()) as {
        tenant: { slug: string; status: string };
        readiness: { ready: boolean };
      };
      expect(mockTenant.tenant).toMatchObject({
        slug: "tenant-mock",
        status: "onboarding",
      });
      expect(mockTenant.readiness.ready).toBe(false);
    }

    const pair = await arrangeTenantPair(page.request, "provisioning");
    expect(pair.verificationToken).not.toBeNull();

    const replay = await page.request.post(
      "/api/v1/auth/email-verifications/confirm",
      { data: { token: pair.verificationToken } },
    );
    expect(replay.status()).toBe(409);

    await page.goto("/admin/select-business");
    await expect(page.getByText(pair.tenantA.name)).toBeVisible();
    await expect(page.getByText(pair.tenantB.name)).toBeVisible();

    await page.getByRole("link", { name: new RegExp(pair.tenantA.name) }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/${pair.tenantA.id}/onboarding$`),
    );
    await expect(
      page.getByRole("heading", { name: "Antes de comenzar a vender" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Activar ventas" }),
    ).toBeDisabled();

    await page.getByRole("link", { name: "Cambiar negocio" }).click();
    await page.getByRole("link", { name: new RegExp(pair.tenantB.name) }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/${pair.tenantB.id}/onboarding$`),
    );
    await expect(page.getByText(`Contexto: ${pair.tenantB.id}`)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Activar ventas" }),
    ).toBeDisabled();
  });
});
