export type MercadoPagoTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  scopes: string[];
};

export class MercadoPagoDependencyError extends Error {}
export class MercadoPagoAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

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

// Only non-sensitive diagnostic fields are surfaced; tokens and credentials are never logged.
async function readProviderErrorDetail(response: Response) {
  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const parts: string[] = [];
  for (const field of ["error", "error_description", "message"] as const) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) parts.push(`${field}=${value.trim()}`);
  }
  return parts.length ? parts.join(" ") : null;
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

  authorizationUrl(input: { state: string }) {
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
    return url.toString();
  }

  exchangeCode(code: string) {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
    });
  }

  refresh(refreshToken: string) {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  async revoke(
    input: string | { userId: string; accessToken: string },
  ): Promise<{ confirmed: boolean }> {
    const accessToken = typeof input === "string" ? input : input.accessToken;
    const url =
      typeof input === "object" && input.userId
        ? `${this.apiBaseUrl()}/users/${encodeURIComponent(input.userId)}/applications/${encodeURIComponent(this.config.clientId)}`
        : `${this.apiBaseUrl()}/oauth/token`;

    try {
      const response = await this.request(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        return { confirmed: true };
      }
      if (
        response.status === 404 ||
        response.status === 401 ||
        response.status === 403
      ) {
        return { confirmed: false };
      }
      throw new MercadoPagoDependencyError(
        `Mercado Pago revoke failed with status ${response.status}.`,
      );
    } catch (error) {
      if (error instanceof MercadoPagoDependencyError) throw error;
      throw new MercadoPagoDependencyError("Mercado Pago revoke request failed.");
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
    let response: Response;
    try {
      response = await this.request(`${this.apiBaseUrl()}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          ...body,
        }),
      });
    } catch (error) {
      throw new MercadoPagoDependencyError(
        `Mercado Pago OAuth exchange request failed: ${
          error instanceof Error ? error.message : "unknown transport error"
        }`,
      );
    }
    if (!response.ok) {
      throw await this.exchangeFailure(response);
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

  private async exchangeFailure(response: Response) {
    const detail = await readProviderErrorDetail(response);
    const summary = `Mercado Pago OAuth exchange failed with status ${
      response.status
    }${detail ? ` (${detail})` : ""}.`;
    if (response.status >= 400 && response.status < 500) {
      return new MercadoPagoAuthorizationError(summary, response.status);
    }
    return new MercadoPagoDependencyError(summary);
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
