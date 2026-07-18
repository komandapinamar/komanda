import {
  MercadoPagoIntegrationConflictError,
  MercadoPagoIntegrationDependencyError,
  MercadoPagoIntegrationNotFoundError,
  MercadoPagoOAuthStateError,
} from "@/features/payments/application/integration.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

export class InvalidIntegrationVersionHeaderError extends Error {}

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
    (error instanceof Error && error.message === "INVALID_SESSION")
  ) {
    return nonDisclosingNotFound(correlationId);
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

  if (error instanceof MercadoPagoIntegrationConflictError) {
    return problemResponse({
      status: 409,
      title: "Integration conflict",
      code: "INTEGRATION_CONFLICT",
      correlationId,
    });
  }

  if (error instanceof MercadoPagoIntegrationDependencyError) {
    return problemResponse({
      status: 503,
      title: "Payment provider unavailable",
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
      correlationId,
    });
  }

  return problemResponse({
    status: 500,
    title: "Internal Server Error",
    code: "INTERNAL_ERROR",
    correlationId,
  });
}
