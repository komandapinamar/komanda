import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { PrintAgentService } from "@/features/printing/application/print-agent.service";
import { printingErrorResponse } from "@/features/printing/web/printing-http";
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
    const enrollment = await new PrintAgentService().enroll(
      context,
      await request.json(),
      idempotencyKey,
    );
    return Response.json(enrollment, {
      status: 201,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return printingErrorResponse(error, correlationId);
  }
}
