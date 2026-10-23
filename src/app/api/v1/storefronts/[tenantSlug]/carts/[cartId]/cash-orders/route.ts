import { ZodError } from "zod";
import {
  BusinessClosedError,
  CashOrderCartUnavailableError,
  CreateCashOrderService,
  OrderConflictError,
  OrderingNotSupportedError,
} from "@/features/orders/application/create-cash-order.service";
import { PublicTenantNotFoundError } from "@/features/tenancy/application/public-tenant.service";
import { CouponTenderMismatchError } from "@/features/discounts/domain/discount.rules";
import {
  globalCashOrderRateLimiter,
  PublicRateLimitExceededError,
} from "@/features/orders/infrastructure/public-order-rate-limiter";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "@/lib/idempotency/idempotency.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantSlug: string; cartId: string }>;
};

export function cashOrderErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof PublicTenantNotFoundError ||
    error instanceof CashOrderCartUnavailableError
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

  if (error instanceof PublicRateLimitExceededError) {
    return problemResponse({
      status: 429,
      title: "Too many requests",
      code: "RATE_LIMITED",
      detail: "Demasiadas solicitudes. Intente nuevamente más tarde.",
      correlationId,
    });
  }

  if (error instanceof ZodError) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      correlationId,
      errors: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (
    error instanceof OrderConflictError ||
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError
  ) {
    return problemResponse({
      status: 409,
      title: "Order conflict",
      code: "ORDER_CONFLICT",
      detail: error instanceof Error ? error.message : undefined,
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

export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  if (!idempotencyKey) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "IDEMPOTENCY_KEY_REQUIRED",
      correlationId,
    });
  }

  try {
    const { tenantSlug, cartId } = await context.params;

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rateLimitKey = `${tenantSlug}:${clientIp}`;
    const rateLimit = globalCashOrderRateLimiter.checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return cashOrderErrorResponse(
        new PublicRateLimitExceededError(rateLimit.retryAfterSeconds),
        correlationId,
      );
    }

    const body = await request.json().catch(() => ({}));
    const order = await new CreateCashOrderService().create({
      tenantSlug,
      cartId,
      idempotencyKey,
      body,
      correlationId,
    });
    globalCashOrderRateLimiter.record(rateLimitKey);

    return Response.json(order, {
      status: 201,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return cashOrderErrorResponse(error, correlationId);
  }
}
