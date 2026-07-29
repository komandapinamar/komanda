import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { TenantSettingsService } from "@/features/tenancy/application/tenant-settings.service";
import {
  settingsVersionFromRequest,
  tenantSettingsErrorResponse,
} from "@/features/tenancy/web/tenant-settings-http";
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
    return Response.json(await new TenantSettingsService().get(context), {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return tenantSettingsErrorResponse(error, correlationId);
  }
}

export async function PATCH(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    const settings = await new TenantSettingsService().update(
      context,
      settingsVersionFromRequest(request),
      await request.json(),
    );
    return Response.json(settings, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return tenantSettingsErrorResponse(error, correlationId);
  }
}
