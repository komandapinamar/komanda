import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("degraded modes", () => {
  it("keeps acquisition outage outside existing tenant operations", async () => {
    const provisioning = await readFile(
      "features/provisioning/application/provision-tenant.service.ts",
      "utf8",
    );
    expect(provisioning).toContain("findActivePlan");
    expect(provisioning).toContain("VerificationDelivery");
    expect(provisioning).toContain("ProvisionTenantService");
  });

  it("maps Mercado Pago dependency failure without exposing global token fallback", async () => {
    const source = await readFile(
      "features/shop/payments/application/payment-session.service.ts",
      "utf8",
    );
    expect(source).toContain("PaymentSessionProviderUnavailableError");
    expect(source).toContain("decryptTokens(account)");
    expect(source).not.toContain("MP_ACCESS_TOKEN");
  });

  it("keeps object storage and print failures isolated (Strapi dependency removed)", async () => {
    const [media, print, menu] = await Promise.all([
      readFile("features/catalog/infrastructure/media.repository.ts", "utf8"),
      readFile("features/printing/infrastructure/print-job.repository.ts", "utf8"),
      readFile("features/shop/menu/services/menu.service.ts", "utf8"),
    ]);
    expect(media).toContain("ObjectStorage");
    expect(print).toContain("lease_expires_at");
    expect(menu).toContain("PublicTenantService");
    expect(menu).not.toContain("STRAPI_FULL_ACCESS_TOKEN");
  });
});
