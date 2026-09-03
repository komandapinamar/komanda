import { AnalyticsService } from "@/features/analytics/application/analytics.service";
import { cartErrorResponse } from "@/features/cart/web/cart-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantSlug } = await route.params;
    const body = await request.json();
    const result = await new AnalyticsService().recordStorefrontSession(
      tenantSlug,
      body,
    );

    return Response.json(
      { success: true, sessionId: result.id },
      {
        status: 200,
        headers: { "X-Correlation-Id": correlationId },
      },
    );
  } catch (error) {
    return cartErrorResponse(error, correlationId);
  }
}
