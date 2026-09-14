import { BarcodeLookupService } from "@/features/catalog/application/barcode-lookup.service";
import { catalogErrorResponse } from "@/features/catalog/web/catalog-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwnerOrAdmin } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwnerOrAdmin(context);

    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode");
    if (!barcode) {
      return Response.json(
        { title: "El parámetro barcode es requerido." },
        { status: 400 },
      );
    }

    const service = new BarcodeLookupService();
    const result = await service.lookup(context, barcode);
    return Response.json(result);
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}
