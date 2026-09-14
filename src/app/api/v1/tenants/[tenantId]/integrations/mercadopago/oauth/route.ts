import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { MercadoPagoIntegrationService } from "@/features/payments/application/integration.service";
import { integrationErrorResponse } from "@/features/payments/web/integration-http";
import { requireOwner } from "@/lib/authorization/role-guard";
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
    requireOwner(context);
    const session = new MercadoPagoIntegrationService().startOAuth(context);
    return Response.json(session, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return integrationErrorResponse(error, correlationId);
  }
}
