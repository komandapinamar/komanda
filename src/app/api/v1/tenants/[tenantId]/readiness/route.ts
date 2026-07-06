import { coreSessionService, sessionTokenFromRequest } from "@/features/identity/web/authenticated-session";
import { TenantReadinessService } from "@/features/tenancy/application/tenant-readiness.service";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  const token = await sessionTokenFromRequest(request);
  if (!token) {
    return problemResponse({ status: 401, title: "Unauthorized", code: "INVALID_SESSION", correlationId });
  }
  try {
    const { tenantId } = await context.params;
    const authority = await coreSessionService().authorizeTenant(token, tenantId);
    const readiness = await new TenantReadinessService().get(
      authority.session,
      authority.membership,
    );
    return Response.json(readiness, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch {
    return nonDisclosingNotFound(correlationId);
  }
}
