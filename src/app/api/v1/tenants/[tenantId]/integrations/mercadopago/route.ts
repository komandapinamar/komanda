import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { MercadoPagoIntegrationService } from "@/features/payments/application/integration.service";
import {
  integrationErrorResponse,
  integrationVersionFromRequest,
} from "@/features/payments/web/integration-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    const status = await new MercadoPagoIntegrationService().getStatus(context);
    return Response.json(status, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return integrationErrorResponse(error, correlationId);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    await new MercadoPagoIntegrationService().revoke(
      context,
      integrationVersionFromRequest(request),
    );
    return new Response(null, {
      status: 204,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return integrationErrorResponse(error, correlationId);
  }
}
