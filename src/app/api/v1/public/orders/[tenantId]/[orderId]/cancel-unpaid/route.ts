import { ZodError } from "zod";
import { CancelUnpaidOrderService } from "@/features/orders/application/cancel-unpaid-order.service";
import {
  InvalidPickupPinError,
  OrderAlreadyPaidError,
  OrderConflictError,
  OrderNotFoundError,
} from "@/features/orders/application/order-errors";
import {
  globalPinAttemptRateLimiter,
  PinRateLimitExceededError,
} from "@/features/orders/infrastructure/pin-rate-limiter";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantId: string; orderId: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cancelUnpaidOrderErrorResponse(
  error: unknown,
  correlationId: string,
) {
  if (error instanceof OrderNotFoundError) {
    return nonDisclosingNotFound(correlationId);
  }

  if (error instanceof OrderAlreadyPaidError) {
    return problemResponse({
      status: 409,
      title: "Order already paid",
      code: "ORDER_ALREADY_PAID",
      detail:
        error.message ||
        "La orden ya ha sido abonada y no puede ser cancelada.",
      correlationId,
    });
  }

  if (error instanceof InvalidPickupPinError) {
    return problemResponse({
      status: 422,
      title: "Invalid pickup PIN",
      code: "INVALID_PICKUP_PIN",
      detail: error.message || "El código PIN de retiro es inválido.",
      correlationId,
    });
  }

  if (error instanceof PinRateLimitExceededError) {
    return problemResponse({
      status: 429,
      title: "Too many attempts",
      code: "PIN_RATE_LIMITED",
      detail:
        "Demasiados intentos fallidos. Intente nuevamente más tarde.",
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

  if (error instanceof OrderConflictError) {
    return problemResponse({
      status: 409,
      title: "Order conflict",
      code: "ORDER_CONFLICT",
      detail: error.message,
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
  const headers = {
    "Cache-Control": "no-store",
    "X-Correlation-Id": correlationId,
  };

  try {
    const { tenantId, orderId } = await context.params;

    if (!uuidPattern.test(tenantId) || !uuidPattern.test(orderId)) {
      return nonDisclosingNotFound(correlationId);
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rateLimitKey = `${tenantId}:${orderId}:${clientIp}`;

    const rateLimit = globalPinAttemptRateLimiter.checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return cancelUnpaidOrderErrorResponse(
        new PinRateLimitExceededError(rateLimit.retryAfterSeconds),
        correlationId,
      );
    }

    const body = await request.json().catch(() => ({}));

    try {
      const data = await new CancelUnpaidOrderService().cancel({
        tenantId,
        orderId,
        body,
        correlationId,
      });
      globalPinAttemptRateLimiter.recordSuccess(rateLimitKey);

      return Response.json(
        {
          success: true,
          data,
        },
        {
          status: 200,
          headers,
        },
      );
    } catch (error) {
      if (error instanceof InvalidPickupPinError) {
        globalPinAttemptRateLimiter.recordFailure(rateLimitKey);
      }
      throw error;
    }
  } catch (error) {
    return cancelUnpaidOrderErrorResponse(error, correlationId);
  }
}
