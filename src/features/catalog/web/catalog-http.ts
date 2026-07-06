import { ZodError } from "zod";
import {
  CatalogConflictError,
  CatalogEntitlementDeniedError,
  CatalogNotFoundError,
} from "@/features/catalog/application/catalog.service";
import { CatalogRuleViolationError } from "@/features/catalog/domain/catalog.rules";
import {
  MediaAssetNotFoundError,
  MediaVerificationError,
} from "@/features/catalog/infrastructure/media.repository";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

export class InvalidVersionHeaderError extends Error {}

export function versionFromRequest(request: Request) {
  const value = request.headers.get("if-match");
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new InvalidVersionHeaderError("If-Match must be a positive integer.");
  }
  return Number(value);
}

export function catalogErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof CatalogNotFoundError ||
    error instanceof MediaAssetNotFoundError ||
    error instanceof CatalogEntitlementDeniedError ||
    (error instanceof Error && error.message === "INVALID_SESSION")
  ) {
    return nonDisclosingNotFound(correlationId);
  }
  if (error instanceof ZodError || error instanceof InvalidVersionHeaderError) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      correlationId,
    });
  }
  if (
    error instanceof CatalogConflictError ||
    error instanceof CatalogRuleViolationError ||
    error instanceof MediaVerificationError
  ) {
    return problemResponse({
      status: 409,
      title: "Catalog conflict",
      code: "CATALOG_CONFLICT",
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
