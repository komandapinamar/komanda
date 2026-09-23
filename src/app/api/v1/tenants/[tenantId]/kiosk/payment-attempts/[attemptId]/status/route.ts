import { KioskPaymentService } from "@/features/payments/application/kiosk-payment.service";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { kioskPaymentErrorResponse } from "@/features/payments/web/kiosk-payment-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantId: string; attemptId: string }>;
};

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, attemptId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    const result = await new KioskPaymentService().getAttemptStatus({
      context,
      attemptId,
    });
    return Response.json(result, {
      status: 200,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return kioskPaymentErrorResponse(error, correlationId);
  }
}
