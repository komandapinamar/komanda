import { CatalogService } from "@/features/catalog/application/catalog.service";
import {
  catalogErrorResponse,
  versionFromRequest,
} from "@/features/catalog/web/catalog-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantId: string; categoryId: string }>;
};

export async function PATCH(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, categoryId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    const category = await new CatalogService().updateCategory(context, categoryId, {
      ...(await request.json()),
      version: versionFromRequest(request),
    });
    return Response.json(category);
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, categoryId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    await new CatalogService().archiveCategory(context, categoryId, {
      version: versionFromRequest(request),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}
