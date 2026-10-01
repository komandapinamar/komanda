import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/payments/application/integration.service", () => ({
  MercadoPagoIntegrationService: vi.fn(),
  MercadoPagoAccountAlreadyLinkedError: class extends Error {},
  MercadoPagoIntegrationConflictError: class extends Error {},
  MercadoPagoIntegrationDependencyError: class extends Error {},
  MercadoPagoIntegrationNotFoundError: class extends Error {},
  MercadoPagoOAuthStateError: class extends Error {},
  oauthStateTenantId: vi.fn(() => null),
}));

import {
  MercadoPagoAccountAlreadyLinkedError,
  MercadoPagoIntegrationNotFoundError,
  MercadoPagoIntegrationService,
  oauthStateTenantId,
} from "@/features/payments/application/integration.service";
import {
  GET,
  redirectTo,
} from "@/app/api/v1/integrations/mercadopago/oauth/callback/route";

const callbackUrl =
  "https://localhost:3000/api/v1/integrations/mercadopago/oauth/callback?code=123&state=abc";

function mockCompleteOAuth(error: Error | null, tenantId = "tenant-1") {
  vi.mocked(MercadoPagoIntegrationService).mockImplementation(function () {
    return {
      completeOAuth: error
        ? vi.fn().mockRejectedValue(error)
        : vi.fn().mockResolvedValue({ tenantId }),
    };
  } as never);
}

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

  it("marks the redirect as no-store so the callback is never replayed from cache", () => {
    const request = new Request(
      "https://app.komanda.app/api/v1/integrations/mercadopago/oauth/callback?code=123&state=abc",
    );

    const response = redirectTo(request, "/admin/tenant-1/integrations");

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("OAuth callback outcome redirects", () => {
  it("redirects to the settings screen after a successful connection", async () => {
    mockCompleteOAuth(null);

    const response = await GET(new Request(callbackUrl));

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/admin/tenant-1/settings?mercadopago=connected",
    );
  });

  it("redirects with the account-already-linked reason instead of a generic error", async () => {
    mockCompleteOAuth(new MercadoPagoAccountAlreadyLinkedError());
    vi.mocked(oauthStateTenantId).mockReturnValue("tenant-1");

    const response = await GET(new Request(callbackUrl));

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/admin/tenant-1/settings?mercadopago=error&reason=account-already-linked",
    );
  });

  it("keeps undisclosed failures on the problem response", async () => {
    mockCompleteOAuth(new MercadoPagoIntegrationNotFoundError());
    vi.mocked(oauthStateTenantId).mockReturnValue("tenant-1");

    const response = await GET(new Request(callbackUrl));

    expect(response.status).toBe(404);
    expect(response.headers.get("Location")).toBeNull();
  });
});
