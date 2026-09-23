import { KioskPaymentService } from "@/features/payments/application/kiosk-payment.service";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { kioskPaymentErrorResponse } from "@/features/payments/web/kiosk-payment-http";
import { problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantId: string; attemptId: string }>;
};

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "IDEMPOTENCY_KEY_REQUIRED",
      detail: "Idempotency-Key header is required.",
      correlationId,
    });
  }

  try {
    const { tenantId, attemptId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    const result = await new KioskPaymentService().cancelAttempt({
      context,
      attemptId,
      idempotencyKey,
    });
    return Response.json(result, {
      status: 200,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return kioskPaymentErrorResponse(error, correlationId);
  }
}
