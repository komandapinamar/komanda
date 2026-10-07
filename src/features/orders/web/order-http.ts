import { ZodError } from "zod";
import { OrderTransitionError } from "@/features/orders/domain/order.rules";
import {
  BusinessClosedError,
  CashOrderCartUnavailableError,
  ForbiddenRoleError,
  InvalidPickupPinError,
  NoOpenCashShiftError,
  OrderAlreadyPaidError,
  OrderConflictError,
  OrderNotFoundError,
  OrderValidationError,
  OrderingNotSupportedError,
} from "@/features/orders/application/order-errors";
import { TenantAccessDeniedError } from "@/features/identity/application/session.service";
import { CouponTenderMismatchError } from "@/features/discounts/domain/discount.rules";
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
    error instanceof CashOrderCartUnavailableError ||
    error instanceof TenantAccessDeniedError ||
    (error instanceof Error && error.message === "INVALID_SESSION")
  ) {
    return nonDisclosingNotFound(correlationId);
  }

  if (error instanceof CouponTenderMismatchError) {
    return problemResponse({
      status: 422,
      title: "Coupon tender mismatch",
      code: "COUPON_TENDER_MISMATCH",
      detail: error.message,
      correlationId,
    });
  }

  if (error instanceof OrderingNotSupportedError) {
    return problemResponse({
      status: 422,
      title: "Ordering not supported",
      code: "ORDERING_NOT_SUPPORTED",
      detail:
        error.message ||
        "El comercio opera en modo autoservicio presencial. Los pedidos web no están habilitados.",
      correlationId,
    });
  }

  if (error instanceof BusinessClosedError) {
    return problemResponse({
      status: 422,
      title: "Business closed",
      code: "BUSINESS_CLOSED",
      detail:
        error.message ||
        "El restaurante no se encuentra aceptando pedidos en este horario.",
      correlationId,
    });
  }

  if (
    error instanceof ForbiddenRoleError ||
    (error instanceof Error &&
      ("code" in error &&
        (error as { code?: string }).code === "FORBIDDEN_ROLE"))
  ) {
    return problemResponse({
      status: 403,
      title: "Forbidden",
      code: "FORBIDDEN_ROLE",
      detail: error.message || "Access is restricted to the required role.",
      correlationId,
    });
  }

  if (error instanceof InvalidPickupPinError) {
    return problemResponse({
      status: 422,
      title: "Invalid pickup PIN",
      code: "INVALID_PICKUP_PIN",
      detail: error.message,
      correlationId,
    });
  }

  if (error instanceof NoOpenCashShiftError) {
    return problemResponse({
      status: 422,
      title: "No open cash shift",
      code: "NO_OPEN_CASH_SHIFT",
      detail:
        error.message ||
        "No existe un turno de caja abierto para registrar el cobro.",
      correlationId,
    });
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

  if (error instanceof OrderAlreadyPaidError) {
    return problemResponse({
      status: 409,
      title: "Order already paid",
      code: "ORDER_ALREADY_PAID",
      detail: error.message,
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
