import { ZodError } from "zod";
import {
  DiscountConflictError,
  DiscountNotFoundError,
  DiscountRuleViolationError,
} from "@/features/discounts/application/discount.service";
import { TenantAccessDeniedError } from "@/features/identity/application/session.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

export class InvalidVersionHeaderError extends Error {}

export function versionFromRequest(request: Request): number | undefined {
  const value = request.headers.get("if-match");
  if (!value) {
    return undefined;
  }
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new InvalidVersionHeaderError("If-Match must be a positive integer.");
  }
  return Number(value);
}

export function discountErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof DiscountNotFoundError ||
    error instanceof TenantAccessDeniedError ||
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
      detail:
        error instanceof ZodError
          ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
          : error.message,
    });
  }

  if (
    error instanceof DiscountConflictError ||
    error instanceof DiscountRuleViolationError
  ) {
    return problemResponse({
      status: 409,
      title: "Discount conflict",
      code: "DISCOUNT_CONFLICT",
      correlationId,
      detail: error.message,
    });
  }

  return problemResponse({
    status: 500,
    title: "Internal Server Error",
    code: "INTERNAL_ERROR",
    correlationId,
  });
}
