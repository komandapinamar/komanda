import { ZodError } from "zod";
import { AnalyticsService } from "@/features/analytics/application/analytics.service";
import { PublicTenantNotFoundError } from "@/features/tenancy/application/public-tenant.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantSlug } = await route.params;
    const body = await request.json();
    const service = new AnalyticsService();

    if (body && typeof body === "object" && "events" in body) {
      const result = await service.ingestTelemetryBatch(tenantSlug, body);
      return Response.json(
        { success: true, count: result.count },
        {
          status: 200,
          headers: { "X-Correlation-Id": correlationId },
        },
      );
    }

    const result = await service.recordStorefrontSession(tenantSlug, body);

    return Response.json(
      { success: true, sessionId: result.id },
      {
        status: 200,
        headers: { "X-Correlation-Id": correlationId },
      },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return problemResponse({
        status: 400,
        title: "Bad Request",
        code: "INVALID_JSON",
        detail: "Malformed JSON body.",
        correlationId,
      });
    }
    if (error instanceof PublicTenantNotFoundError) {
      return nonDisclosingNotFound(correlationId);
    }
    if (error instanceof ZodError) {
      return problemResponse({
        status: 400,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        detail: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
        correlationId,
      });
    }
    return problemResponse({
      status: 500,
      title: "Internal Server Error",
      code: "INTERNAL_ERROR",
      correlationId,
    });
  }
}

