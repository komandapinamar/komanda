export type MercadoPagoTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  scopes: string[];
};

export class MercadoPagoDependencyError extends Error {}

function testEndpoint(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (
    process.env.KOMANDA_TEST_MODE !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(`${name} can only override Mercado Pago in test mode.`);
  }
  return value;
}

export class MercadoPagoOAuthClient {
  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      timeoutMs?: number;
    },
  ) {}

  authorizationUrl(input: { state: string; codeChallenge: string }) {
    const url = new URL(
      testEndpoint(
        "MERCADOPAGO_AUTHORIZATION_URL",
        "https://auth.mercadopago.com.ar/authorization",
      ),
    );
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  exchangeCode(code: string, codeVerifier: string) {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier,
    });
  }

  refresh(refreshToken: string) {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  async revoke(accessToken: string) {
    const response = await this.request(
      `${this.apiBaseUrl()}/oauth/token`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new MercadoPagoDependencyError("Mercado Pago revoke failed.");
    }
  }

  async verify(accessToken: string) {
    const response = await this.request(`${this.apiBaseUrl()}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new MercadoPagoDependencyError("Mercado Pago health check failed.");
    }
    const body = (await response.json()) as { id?: string | number };
    if (!body.id) throw new MercadoPagoDependencyError("Invalid seller response.");
    return { sellerId: String(body.id) };
  }

  private async tokenRequest(body: Record<string, string>) {
    const response = await this.request(`${this.apiBaseUrl()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...body,
      }),
    });
    if (!response.ok) {
      throw new MercadoPagoDependencyError("Mercado Pago OAuth exchange failed.");
    }
    const payload = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user_id?: string | number;
      scope?: string;
    };
    if (
      !payload.access_token ||
      !payload.refresh_token ||
      !payload.expires_in ||
      !payload.user_id
    ) {
      throw new MercadoPagoDependencyError("Incomplete Mercado Pago OAuth response.");
    }
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in,
      userId: String(payload.user_id),
      scopes: payload.scope?.split(/\s+/).filter(Boolean) ?? [],
    } satisfies MercadoPagoTokens;
  }

  private request(url: string, init: RequestInit) {
    return fetch(url, {
      ...init,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 5_000),
      cache: "no-store",
    });
  }

  private apiBaseUrl() {
    return testEndpoint(
      "MERCADOPAGO_API_BASE_URL",
      "https://api.mercadopago.com",
    ).replace(/\/$/, "");
  }
}

export function mercadoPagoOAuthClientFromEnvironment() {
  const clientId = process.env.MERCADOPAGO_CLIENT_ID;
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
  const redirectUri = process.env.MERCADOPAGO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Mercado Pago OAuth is not configured.");
  }
  return new MercadoPagoOAuthClient({ clientId, clientSecret, redirectUri });
}
