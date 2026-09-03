import { ZodError } from "zod";
import {
  PaymentSessionCartUnavailableError,
  PaymentSessionConflictError,
  PaymentSessionProviderUnavailableError,
  PaymentSessionService,
} from "@/features/payments/application/payment-session.service";
import { PublicTenantNotFoundError } from "@/features/tenancy/application/public-tenant.service";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "@/lib/idempotency/idempotency.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantSlug: string; cartId: string }>;
};

function baseUrlFromRequest() {
  const configured = process.env.KOMANDA_PUBLIC_BASE_URL?.trim();
  if (!configured) {
    throw new Error("KOMANDA_PUBLIC_BASE_URL is required for payment sessions.");
  }
  const url = new URL(configured);
  return url.origin;
}

function paymentSessionErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof PublicTenantNotFoundError ||
    error instanceof PaymentSessionCartUnavailableError
  ) {
    return nonDisclosingNotFound(correlationId);
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
    error instanceof PaymentSessionConflictError ||
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError
  ) {
    return problemResponse({
      status: 409,
      title: "Payment session conflict",
      code: "PAYMENT_SESSION_CONFLICT",
      correlationId,
    });
  }

  if (error instanceof PaymentSessionProviderUnavailableError) {
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
    const session = await new PaymentSessionService().create({
      tenantSlug,
      cartId,
      idempotencyKey,
      body: await request.json(),
      baseUrl: baseUrlFromRequest(),
      correlationId,
    });

    return Response.json(session, {
      status: 201,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return paymentSessionErrorResponse(error, correlationId);
  }
}
