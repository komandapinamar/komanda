import { ZodError } from "zod";
import {
  TenantActivationConflictError,
  TenantSettingsConflictError,
  TenantSettingsEntitlementDeniedError,
  TenantSettingsNotFoundError,
} from "@/features/tenancy/application/tenant-settings.service";
import { TenantAccessDeniedError } from "@/features/identity/application/session.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

export class InvalidTenantSettingsVersionHeaderError extends Error {}

function postgresErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return (error as { code?: unknown }).code;
}

export function settingsVersionFromRequest(request: Request) {
  const value = request.headers.get("if-match");
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new InvalidTenantSettingsVersionHeaderError(
      "If-Match must be a positive integer.",
    );
  }
  return Number(value);
}

export function tenantSettingsErrorResponse(
  error: unknown,
  correlationId: string,
) {
  if (
    error instanceof TenantSettingsNotFoundError ||
    error instanceof TenantSettingsEntitlementDeniedError ||
    error instanceof TenantAccessDeniedError ||
    (error instanceof Error && error.message === "INVALID_SESSION")
  ) {
    return nonDisclosingNotFound(correlationId);
  }

  if (
    error instanceof ZodError ||
    error instanceof InvalidTenantSettingsVersionHeaderError
  ) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      correlationId,
    });
  }

  if (
    error instanceof TenantSettingsConflictError ||
    error instanceof TenantActivationConflictError
  ) {
    return problemResponse({
      status: 409,
      title: "Tenant settings conflict",
      code: "TENANT_SETTINGS_CONFLICT",
      correlationId,
    });
  }

  const code = postgresErrorCode(error);
  if (code === "23503" || code === "P0001") {
    return problemResponse({
      status: 409,
      title: "Tenant still has dependent records",
      detail:
        "The tenant could not be erased because related records still reference it.",
      code: "TENANT_DELETE_CONFLICT",
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
