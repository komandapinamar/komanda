import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("tenant payments producer contract", () => {
  it("has implemented route adapters for payment operations", async () => {
    const [settingsRoute, integrationRoute, oauthRoute, callbackRoute, webhookRoute, paymentSessionRoute] =
      await Promise.all([
        readFile("app/api/v1/tenants/[tenantId]/settings/route.ts", "utf8"),
        readFile("app/api/v1/tenants/[tenantId]/integrations/mercadopago/route.ts", "utf8"),
        readFile("app/api/v1/tenants/[tenantId]/integrations/mercadopago/oauth/route.ts", "utf8"),
        readFile("app/api/v1/integrations/mercadopago/oauth/callback/route.ts", "utf8"),
        readFile("app/api/v1/integrations/mercadopago/webhooks/[routingKey]/route.ts", "utf8"),
        readFile("app/api/v1/storefronts/[tenantSlug]/carts/[cartId]/payment-sessions/route.ts", "utf8"),
      ]);

    expect(settingsRoute).toContain("PATCH");
    expect(integrationRoute).toContain("GET");
    expect(integrationRoute).toContain("DELETE");
    expect(oauthRoute).toContain("POST");
    expect(callbackRoute).toContain("GET");
    expect(webhookRoute).toContain("POST");
    expect(paymentSessionRoute).toContain("POST");
  });
});
