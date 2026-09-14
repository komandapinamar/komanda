import { CatalogService } from "@/features/catalog/application/catalog.service";
import { catalogErrorResponse, versionFromRequest } from "@/features/catalog/web/catalog-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwnerOrAdmin } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string; comboId: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, comboId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwnerOrAdmin(context);
    const combo = await new CatalogService().updateCombo(context, comboId, {
      ...(await request.json()),
      version: versionFromRequest(request),
    });
    return Response.json(combo);
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, comboId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwnerOrAdmin(context);
    await new CatalogService().archiveCombo(context, comboId, {
      version: versionFromRequest(request),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}
