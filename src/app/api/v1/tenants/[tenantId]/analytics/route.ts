import { AnalyticsService } from "@/features/analytics/application/analytics.service";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );

    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const granularity =
      (url.searchParams.get("granularity") as "hour" | "day" | "week" | "month") ?? "day";
    const categoryId = url.searchParams.get("categoryId") ?? undefined;
    const source = (url.searchParams.get("source") as "all" | "mercadopago_webhook" | "admin_direct") ?? "all";

    const metrics = await new AnalyticsService().getDashboardMetrics({
      context,
      filter: {
        from,
        to,
        granularity,
        categoryId,
        source,
      },
    });

    return Response.json(metrics, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return orderErrorResponse(error, correlationId);
  }
}
