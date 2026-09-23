import { KioskPaymentService } from "@/features/payments/application/kiosk-payment.service";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { kioskPaymentErrorResponse } from "@/features/payments/web/kiosk-payment-http";
import { problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

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
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    const baseUrl =
      process.env.KOMANDA_PUBLIC_BASE_URL || new URL(request.url).origin;
    const session = await new KioskPaymentService().createSession({
      context,
      body: await request.json(),
      idempotencyKey,
      baseUrl,
    });
    return Response.json(session, {
      status: 201,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return kioskPaymentErrorResponse(error, correlationId);
  }
}
