import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/payments/application/integration.service", () => ({
  MercadoPagoIntegrationService: vi.fn(),
}));

import { redirectTo } from "@/app/api/v1/integrations/mercadopago/oauth/callback/route";

describe("OAuth callback redirectTo", () => {
  it("converts https://localhost:3000 to http://localhost:3000 to prevent ERR_SSL_PROTOCOL_ERROR", () => {
    const request = new Request(
      "https://localhost:3000/api/v1/integrations/mercadopago/oauth/callback?code=123&state=abc",
    );

    const response = redirectTo(request, "/admin/tenant-1/integrations");

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/admin/tenant-1/integrations",
    );
  });

  it("preserves https for production domains", () => {
    const request = new Request(
      "https://app.komanda.app/api/v1/integrations/mercadopago/oauth/callback?code=123&state=abc",
    );

    const response = redirectTo(request, "/admin/tenant-1/integrations");

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "https://app.komanda.app/admin/tenant-1/integrations",
    );
  });
});
