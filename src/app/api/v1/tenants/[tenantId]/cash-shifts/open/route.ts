import {
  CashShiftConflictError,
  CashShiftService,
} from "@/features/commerce/application/cash-shift.service";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwnerOrAdmin } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwnerOrAdmin(context);

    const body = await request.json();
    const shift = await new CashShiftService().open(context, body);
    return Response.json(shift, { status: 201 });
  } catch (error) {
    if (error instanceof CashShiftConflictError) {
      return Response.json({ title: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Error inesperado.";
    return Response.json({ title: message }, { status: 400 });
  }
}
