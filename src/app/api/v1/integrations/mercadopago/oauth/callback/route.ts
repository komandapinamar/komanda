import { MercadoPagoIntegrationService } from "@/features/payments/application/integration.service";
import { integrationErrorResponse } from "@/features/payments/web/integration-http";
import { problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

function redirectTo(request: Request, path: string) {
  const url = new URL(path, request.url);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();

  if (!code || !state) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      correlationId,
    });
  }

  try {
    const result = await new MercadoPagoIntegrationService().completeOAuth({
      code,
      state,
      correlationId,
    });
    return redirectTo(
      request,
      `/admin/${result.tenantId}/integrations?mercadopago=connected`,
    );
  } catch (error) {
    return integrationErrorResponse(error, correlationId);
  }
}
