import { PublicTenantService } from "@/features/tenancy/application/public-tenant.service";
import { cartErrorResponse } from "@/features/cart/web/cart-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantSlug } = await route.params;
    const catalog = await new PublicTenantService().catalog(tenantSlug);
    return Response.json(catalog, {
      headers: {
        ETag: `W/"${catalog.tenant.slug}-${catalog.revision}"`,
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (error) {
    return cartErrorResponse(error, correlationId);
  }
}
