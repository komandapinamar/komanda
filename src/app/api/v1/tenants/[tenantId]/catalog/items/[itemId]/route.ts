import { CatalogService } from "@/features/catalog/application/catalog.service";
import { catalogErrorResponse, versionFromRequest } from "@/features/catalog/web/catalog-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwnerOrAdmin } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string; itemId: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, itemId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwnerOrAdmin(context);
    const item = await new CatalogService().updateItem(context, itemId, {
      ...(await request.json()),
      version: versionFromRequest(request),
    });
    return Response.json(item);
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, itemId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwnerOrAdmin(context);
    await new CatalogService().archiveItem(context, itemId, {
      version: versionFromRequest(request),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}
