import { coreSessionService, sessionTokenFromRequest } from "@/features/identity/web/authenticated-session";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

export async function GET(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  const token = await sessionTokenFromRequest(request);
  if (!token) {
    return problemResponse({ status: 401, title: "Unauthorized", code: "INVALID_SESSION", correlationId });
  }
  try {
    const memberships = await coreSessionService().listTenants(token);
    return Response.json(
      {
        data: memberships.map((membership) => ({
          id: membership.tenantId,
          name: membership.tenantName,
          slug: membership.tenantSlug,
          status: membership.tenantStatus,
          role: membership.role,
        })),
      },
      { headers: { "X-Correlation-Id": correlationId } },
    );
  } catch {
    return problemResponse({ status: 401, title: "Unauthorized", code: "INVALID_SESSION", correlationId });
  }
}
