import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { TenantDeletionService } from "@/features/tenancy/application/tenant-deletion.service";
import { tenantSettingsErrorResponse } from "@/features/tenancy/web/tenant-settings-http";
import { requireOwner } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    requireOwner(context);
    await new TenantDeletionService().deleteTenant(context);
    return Response.json(
      { success: true, message: "Negocio eliminado exitosamente." },
      { headers: { "X-Correlation-Id": correlationId } },
    );
  } catch (error) {
    return tenantSettingsErrorResponse(error, correlationId);
  }
}
