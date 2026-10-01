import { describe, expect, it, vi, afterEach } from "vitest";
import {
  MercadoPagoOAuthClient,
  MercadoPagoAuthorizationError,
  MercadoPagoDependencyError,
} from "@/features/payments/infrastructure/mercadopago-oauth.client";

describe("MercadoPagoOAuthClient.exchangeCode", () => {
  const client = new MercadoPagoOAuthClient({
    clientId: "app-client-123",
    clientSecret: "app-secret-456",
    redirectUri: "https://example.com/callback",
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns tokens for a successful exchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "access-abc",
          refresh_token: "refresh-abc",
          expires_in: 15552000,
          user_id: 390074350,
          scope: "offline_access read write",
        }),
      ),
    );

    await expect(client.exchangeCode("code-1")).resolves.toEqual({
      accessToken: "access-abc",
      refreshToken: "refresh-abc",
      expiresIn: 15552000,
      userId: "390074350",
      scopes: ["offline_access", "read", "write"],
    });
  });

  it("throws MercadoPagoAuthorizationError when the code is rejected with 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "invalid_request", message: "code has already been used" },
          { status: 400 },
        ),
      ),
    );

    const failure = await client.exchangeCode("consumed-code").catch((e) => e);

    expect(failure).toBeInstanceOf(MercadoPagoAuthorizationError);
    expect(failure).not.toBeInstanceOf(MercadoPagoDependencyError);
    expect(failure.status).toBe(400);
    expect(failure.message).toContain("400");
    expect(failure.message).toContain("invalid_request");
  });

  it("throws MercadoPagoAuthorizationError for 401 responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));

    const failure = await client.exchangeCode("code-1").catch((e) => e);

    expect(failure).toBeInstanceOf(MercadoPagoAuthorizationError);
    expect(failure.status).toBe(401);
  });

  it("throws MercadoPagoDependencyError when the provider returns 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 502 })),
    );

    const failure = await client.exchangeCode("code-1").catch((e) => e);

    expect(failure).toBeInstanceOf(MercadoPagoDependencyError);
    expect(failure).not.toBeInstanceOf(MercadoPagoAuthorizationError);
    expect(failure.message).toContain("502");
  });

  it("throws MercadoPagoDependencyError on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network ECONNRESET");
      }),
    );

    const failure = await client.exchangeCode("code-1").catch((e) => e);

    expect(failure).toBeInstanceOf(MercadoPagoDependencyError);
    expect(failure).not.toBeInstanceOf(MercadoPagoAuthorizationError);
    expect(failure.message).toContain("ECONNRESET");
  });

  it("throws MercadoPagoDependencyError when the timeout aborts the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );

    await expect(client.exchangeCode("code-1")).rejects.toBeInstanceOf(
      MercadoPagoDependencyError,
    );
  });

  it("throws MercadoPagoDependencyError when the payload is incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "access-abc" })),
    );

    await expect(client.exchangeCode("code-1")).rejects.toBeInstanceOf(
      MercadoPagoDependencyError,
    );
  });

  it("never leaks credentials into the failure message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "invalid_request", access_token: "leaked-token" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const failure = await client.exchangeCode("code-1").catch((e) => e);

    expect(failure.message).not.toContain("leaked-token");
    expect(failure.message).not.toContain("app-secret-456");
  });
});
