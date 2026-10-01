import {
  MercadoPagoIntegrationService,
  oauthStateTenantId,
} from "@/features/payments/application/integration.service";
import {
  integrationErrorResponse,
  mercadopagoFailureReason,
} from "@/features/payments/web/integration-http";
import { problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

export function redirectTo(request: Request, path: string) {
  const url = new URL(path, request.url);
  if (url.hostname === "localhost" && url.protocol === "https:") {
    url.protocol = "http:";
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store",
    },
  });
}

function callbackProblem(
  correlationId: string,
  problem: { status: number; title: string; code: string },
) {
  const response = problemResponse({ ...problem, correlationId });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Returns the owner to the settings screen with an outcome the panel can
 * explain, instead of leaving them on a raw problem document. */
function settingsRedirect(
  request: Request,
  tenantId: string,
  query: { mercadopago: string; reason?: string },
) {
  const target = new URL(`/admin/${tenantId}/settings`, request.url);
  target.searchParams.set("mercadopago", query.mercadopago);
  if (query.reason) {
    target.searchParams.set("reason", query.reason);
  }
  return redirectTo(request, `${target.pathname}${target.search}`);
}

export async function GET(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();

  if (!code || !state) {
    return callbackProblem(correlationId, {
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
    });
  }

  try {
    const result = await new MercadoPagoIntegrationService().completeOAuth({
      code,
      state,
      correlationId,
    });
    return settingsRedirect(request, result.tenantId, {
      mercadopago: "connected",
    });
  } catch (error) {
    const reason = mercadopagoFailureReason(error);
    const tenantId = reason ? oauthStateTenantId(state) : null;
    if (reason && tenantId) {
      return settingsRedirect(request, tenantId, {
        mercadopago: "error",
        reason,
      });
    }
    const response = integrationErrorResponse(error, correlationId);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
