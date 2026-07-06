import { CatalogService } from "@/features/catalog/application/catalog.service";
import { catalogErrorResponse } from "@/features/catalog/web/catalog-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    return Response.json({ data: await new CatalogService().listCategories(context) });
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    const category = await new CatalogService().createCategory(
      context,
      await request.json(),
    );
    return Response.json(category, { status: 201 });
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}
