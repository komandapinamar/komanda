import { CatalogService } from "@/features/catalog/application/catalog.service";
import { catalogErrorResponse } from "@/features/catalog/web/catalog-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    const combo = await new CatalogService().createCombo(context, await request.json());
    return Response.json(combo, { status: 201 });
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}
