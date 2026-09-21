import { ZodError } from "zod";
import {
  CartDiscountIneligibleError,
  CartNotFoundError,
  CartRevalidationError,
  RateLimitExceededError,
} from "@/features/cart/application/cart.service";
import { PublicTenantNotFoundError } from "@/features/tenancy/application/public-tenant.service";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "@/lib/idempotency/idempotency.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

export function cartErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof CartNotFoundError ||
    error instanceof PublicTenantNotFoundError
  ) {
    return nonDisclosingNotFound(correlationId);
  }
  if (error instanceof RateLimitExceededError) {
    const res = problemResponse({
      status: 429,
      title: "Too Many Requests",
      code: "RATE_LIMIT_EXCEEDED",
      correlationId,
      detail: error.message,
    });
    res.headers.set("Retry-After", String(error.retryAfterSeconds));
    return res;
  }
  if (error instanceof CartDiscountIneligibleError) {
    return problemResponse({
      status: 422,
      title: "Discount not applicable",
      code: error.reason,
      correlationId,
      detail: error.message,
    });
  }
  if (error instanceof ZodError) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      correlationId,
    });
  }
  if (
    error instanceof CartRevalidationError ||
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError
  ) {
    return problemResponse({
      status: 409,
      title: "Cart conflict",
      code: "CART_CONFLICT",
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
