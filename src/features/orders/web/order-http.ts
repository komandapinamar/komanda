import { ZodError } from "zod";
import { OrderTransitionError } from "@/features/orders/domain/order.rules";
import {
  OrderConflictError,
  OrderNotFoundError,
  OrderValidationError,
} from "@/features/orders/application/order-errors";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

export class InvalidOrderVersionHeaderError extends Error {}

export function orderVersionFromRequest(request: Request) {
  const value = request.headers.get("if-match");
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new InvalidOrderVersionHeaderError(
      "If-Match must be a positive integer.",
    );
  }
  return Number(value);
}

export function orderErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof OrderNotFoundError ||
    (error instanceof Error && error.message === "INVALID_SESSION")
  ) {
    return nonDisclosingNotFound(correlationId);
  }

  if (
    error instanceof ZodError ||
    error instanceof OrderValidationError ||
    error instanceof InvalidOrderVersionHeaderError
  ) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      correlationId,
    });
  }

  if (
    error instanceof OrderConflictError ||
    error instanceof OrderTransitionError
  ) {
    return problemResponse({
      status: 409,
      title: "Order conflict",
      code: "ORDER_CONFLICT",
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
