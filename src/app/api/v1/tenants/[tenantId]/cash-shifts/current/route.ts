import { CashShiftService } from "@/features/commerce/application/cash-shift.service";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    const shift = await new CashShiftService().getCurrent(context);
    return Response.json({ data: shift });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    return Response.json({ title: message }, { status: 500 });
  }
}
