import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { TenantSettingsService } from "@/features/tenancy/application/tenant-settings.service";
import {
  settingsVersionFromRequest,
  tenantSettingsErrorResponse,
} from "@/features/tenancy/web/tenant-settings-http";
import { requireOwner } from "@/lib/authorization/role-guard";
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
    requireOwner(context);
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
    requireOwner(context);
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
