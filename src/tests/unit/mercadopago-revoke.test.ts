import { describe, expect, it, vi, afterEach } from "vitest";
import {
  MercadoPagoOAuthClient,
  MercadoPagoDependencyError,
} from "@/features/payments/infrastructure/mercadopago-oauth.client";

describe("MercadoPagoOAuthClient.revoke", () => {
  const client = new MercadoPagoOAuthClient({
    clientId: "app-client-123",
    clientSecret: "app-secret-456",
    redirectUri: "https://example.com/callback",
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the correct user applications endpoint with DELETE and authorization header", async () => {
    let capturedUrl: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await client.revoke({ userId: "seller-789", accessToken: "token-abc" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toBe("https://api.mercadopago.com/users/seller-789/applications/app-client-123");
    expect(capturedInit?.method).toBe("DELETE");
    expect((capturedInit?.headers as Record<string, string>)?.Authorization).toBe("Bearer token-abc");
  });

  it("returns confirmed: true for 200 and 204 responses", async () => {
    for (const status of [200, 204]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
      const result = await client.revoke({ userId: "seller-789", accessToken: "token-abc" });
      expect(result).toEqual({ confirmed: true });
    }
  });

  it("returns confirmed: false without throwing for 401, 403, and 404 responses", async () => {
    for (const status of [401, 403, 404]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
      const result = await client.revoke({ userId: "seller-789", accessToken: "token-abc" });
      expect(result).toEqual({ confirmed: false });
    }
  });

  it("throws MercadoPagoDependencyError on provider 500 error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    await expect(
      client.revoke({ userId: "seller-789", accessToken: "token-abc" }),
    ).rejects.toBeInstanceOf(MercadoPagoDependencyError);
  });

  it("throws MercadoPagoDependencyError on network fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network ECONNREFUSED");
      }),
    );
    await expect(
      client.revoke({ userId: "seller-789", accessToken: "token-abc" }),
    ).rejects.toBeInstanceOf(MercadoPagoDependencyError);
  });
});
