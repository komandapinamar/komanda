import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { TenantSettingsService } from "@/features/tenancy/application/tenant-settings.service";
import { tenantSettingsErrorResponse } from "@/features/tenancy/web/tenant-settings-http";
import { problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "IDEMPOTENCY_KEY_REQUIRED",
      correlationId,
    });
  }
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    const tenant = await new TenantSettingsService().activate(
      context,
      idempotencyKey,
    );
    return Response.json(tenant, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return tenantSettingsErrorResponse(error, correlationId);
  }
}
