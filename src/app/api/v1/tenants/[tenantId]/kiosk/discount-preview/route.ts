import { KioskPaymentService } from "@/features/payments/application/kiosk-payment.service";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { kioskPaymentErrorResponse } from "@/features/payments/web/kiosk-payment-http";
import { requireOwnerOrAdmin } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    requireOwnerOrAdmin(context);

    const preview = await new KioskPaymentService().previewDiscount({
      context,
      body: await request.json(),
    });

    return Response.json(preview, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return kioskPaymentErrorResponse(error, correlationId);
  }
}
