import {
  MercadoPagoAccountAlreadyLinkedError,
  MercadoPagoIntegrationConflictError,
  MercadoPagoIntegrationDependencyError,
  MercadoPagoIntegrationNotFoundError,
  MercadoPagoOAuthStateError,
} from "@/features/payments/application/integration.service";
import { MercadoPagoAuthorizationError, MercadoPagoDependencyError } from "@/features/payments/infrastructure/mercadopago-oauth.client";
import { TenantAccessDeniedError } from "@/features/identity/application/session.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";
import {
  mercadoPagoFailureMessage,
  type MercadoPagoFailureReason,
} from "./mercado-pago-outcome";

export class InvalidIntegrationVersionHeaderError extends Error {}

function reportIntegrationFailure(error: unknown, correlationId: string) {
  console.error("[integrationErrorResponse]", {
    correlationId,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function integrationVersionFromRequest(request: Request) {
  const value = request.headers.get("if-match");
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new InvalidIntegrationVersionHeaderError(
      "If-Match must be a positive integer.",
    );
  }
  return Number(value);
}

export function integrationErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof MercadoPagoIntegrationNotFoundError ||
    error instanceof TenantAccessDeniedError ||
    (error instanceof Error && error.message === "INVALID_SESSION")
  ) {
    return nonDisclosingNotFound(correlationId);
  }

  if (error instanceof MercadoPagoAccountAlreadyLinkedError) {
    return problemResponse({
      status: 409,
      title: "Mercado Pago account already linked",
      code: "MERCADO_PAGO_ACCOUNT_ALREADY_LINKED",
      detail: mercadoPagoFailureMessage("account-already-linked"),
      correlationId,
    });
  }

  if (
    error instanceof InvalidIntegrationVersionHeaderError ||
    error instanceof MercadoPagoOAuthStateError
  ) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      correlationId,
    });
  }

  if (error instanceof MercadoPagoAuthorizationError) {
    reportIntegrationFailure(error, correlationId);
    return problemResponse({
      status: 422,
      title: "Mercado Pago authorization failed",
      code: "OAUTH_EXCHANGE_REJECTED",
      correlationId,
    });
  }

  if (error instanceof MercadoPagoIntegrationConflictError) {
    return problemResponse({
      status: 409,
      title: "Integration conflict",
      code: "INTEGRATION_CONFLICT",
      correlationId,
    });
  }

  if (
    error instanceof MercadoPagoIntegrationDependencyError ||
    error instanceof MercadoPagoDependencyError
  ) {
    reportIntegrationFailure(error, correlationId);
    return problemResponse({
      status: 503,
      title: "Payment provider unavailable",
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
      correlationId,
    });
  }

  reportIntegrationFailure(error, correlationId);
  return problemResponse({
    status: 500,
    title: "Internal Server Error",
    code: "INTERNAL_ERROR",
    correlationId,
  });
}

/**
 * Owner-facing slug for failures the settings screen can explain. Returns null
 * for undisclosed and unexpected errors so those keep the non-redirecting
 * problem response.
 */
export function mercadopagoFailureReason(
  error: unknown,
): MercadoPagoFailureReason | null {
  if (error instanceof MercadoPagoAccountAlreadyLinkedError) {
    return "account-already-linked";
  }
  if (error instanceof MercadoPagoIntegrationConflictError) {
    return "connection-conflict";
  }
  if (error instanceof MercadoPagoAuthorizationError) {
    return "authorization-rejected";
  }
  if (error instanceof MercadoPagoIntegrationDependencyError) {
    return "provider-unavailable";
  }
  if (error instanceof MercadoPagoDependencyError) {
    return "provider-unavailable";
  }
  if (error instanceof MercadoPagoOAuthStateError) {
    return "session-expired";
  }
  return null;
}
