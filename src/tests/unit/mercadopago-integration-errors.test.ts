import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/features/payments/application/integration.service", () => ({
  MercadoPagoAccountAlreadyLinkedError: class extends Error {},
  MercadoPagoIntegrationConflictError: class extends Error {},
  MercadoPagoIntegrationDependencyError: class extends Error {},
  MercadoPagoIntegrationNotFoundError: class extends Error {},
  MercadoPagoOAuthStateError: class extends Error {},
}));

import {
  MercadoPagoAuthorizationError,
  MercadoPagoDependencyError,
} from "@/features/payments/infrastructure/mercadopago-oauth.client";
import { integrationErrorResponse } from "@/features/payments/web/integration-http";
import {
  MercadoPagoIntegrationDependencyError,
} from "@/features/payments/application/integration.service";
import { mercadoPagoProblemMessage } from "@/features/payments/web/mercado-pago-outcome";

const CORRELATION_ID = "corr-test-1";

async function bodyOf(response: Response) {
  return (await response.json()) as { code: string; status: number };
}

describe("integrationErrorResponse", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 422 OAUTH_EXCHANGE_REJECTED when the provider rejects the code", async () => {
    const response = integrationErrorResponse(
      new MercadoPagoAuthorizationError(
        "Mercado Pago OAuth exchange failed with status 400 (error=invalid_request).",
        400,
      ),
      CORRELATION_ID,
    );

    expect(response.status).toBe(422);
    expect(await bodyOf(response)).toMatchObject({
      status: 422,
      code: "OAUTH_EXCHANGE_REJECTED",
    });
  });

  it("returns 503 PAYMENT_PROVIDER_UNAVAILABLE when the provider is unreachable", async () => {
    const response = integrationErrorResponse(
      new MercadoPagoIntegrationDependencyError(
        "Mercado Pago OAuth exchange request failed: ECONNRESET",
      ),
      CORRELATION_ID,
    );

    expect(response.status).toBe(503);
    expect(await bodyOf(response)).toMatchObject({
      status: 503,
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
    });
  });

  it("does not report a replayed code as a provider outage", () => {
    const replayed = new MercadoPagoAuthorizationError("replayed code", 400);
    const outage = new MercadoPagoIntegrationDependencyError("ECONNRESET");

    expect(integrationErrorResponse(replayed, CORRELATION_ID).status).not.toBe(
      integrationErrorResponse(outage, CORRELATION_ID).status,
    );
  });

  it("keeps MercadoPagoDependencyError from the raw client on the 503 branch", () => {
    const response = integrationErrorResponse(
      new MercadoPagoDependencyError("Mercado Pago OAuth exchange failed with status 500."),
      CORRELATION_ID,
    );

    expect(response.status).toBe(503);
  });

  it("logs the failure with its correlation id", () => {
    integrationErrorResponse(
      new MercadoPagoAuthorizationError("replayed code", 400),
      CORRELATION_ID,
    );

    expect(console.error).toHaveBeenCalledWith(
      "[integrationErrorResponse]",
      expect.objectContaining({ correlationId: CORRELATION_ID, message: "replayed code" }),
    );
  });

  it("logs unexpected errors before returning 500", async () => {
    const response = integrationErrorResponse(new Error("boom"), CORRELATION_ID);

    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith(
      "[integrationErrorResponse]",
      expect.objectContaining({ correlationId: CORRELATION_ID, message: "boom" }),
    );
  });

  it("gives the settings screen a distinct message for a rejected code", () => {
    const rejected = mercadoPagoProblemMessage({ code: "OAUTH_EXCHANGE_REJECTED" });
    const unavailable = mercadoPagoProblemMessage({
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
    });

    expect(rejected).not.toBe(unavailable);
    expect(rejected).toMatch(/rechazó la autorización/i);
  });
});
