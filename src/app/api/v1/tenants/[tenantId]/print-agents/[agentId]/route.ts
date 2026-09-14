import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { PrintAgentService } from "@/features/printing/application/print-agent.service";
import { printingErrorResponse } from "@/features/printing/web/printing-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantId: string; agentId: string }>;
};

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, agentId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    await new PrintAgentService().revoke(context, agentId);
    return new Response(null, {
      status: 204,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return printingErrorResponse(error, correlationId);
  }
}
