import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

describe("tenant payments producer contract", () => {
  it("publishes settings, OAuth-only integration, payment session and webhook operations", async () => {
    const document = parse(
      await readFile(
        resolve(process.cwd(), "../specs/001-multi-tenant-base/contracts/openapi.yaml"),
        "utf8",
      ),
    ) as { paths: Record<string, Record<string, unknown>> };
    for (const [path, method] of [
      ["/api/v1/tenants/{tenantId}/settings", "patch"],
      ["/api/v1/tenants/{tenantId}/integrations/mercadopago", "get"],
      ["/api/v1/tenants/{tenantId}/integrations/mercadopago", "delete"],
      ["/api/v1/tenants/{tenantId}/integrations/mercadopago/oauth", "post"],
      ["/api/v1/integrations/mercadopago/oauth/callback", "get"],
      ["/api/v1/integrations/mercadopago/webhooks/{routingKey}", "post"],
      [
        "/api/v1/storefronts/{tenantSlug}/carts/{cartId}/payment-sessions",
        "post",
      ],
    ] as const) {
      expect(document.paths[path]?.[method]).toBeDefined();
    }
  });
});
