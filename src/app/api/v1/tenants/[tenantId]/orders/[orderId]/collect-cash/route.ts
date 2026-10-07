import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { CollectCashService } from "@/features/orders/application/collect-cash.service";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantId: string; orderId: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const { tenantId, orderId } = await route.params;

    if (!uuidPattern.test(tenantId) || !uuidPattern.test(orderId)) {
      return nonDisclosingNotFound(correlationId);
    }

    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );

    const body = await request.json().catch(() => ({}));

    const data = await new CollectCashService().collect({
      context,
      orderId,
      idempotencyKey,
      body,
    });

    return Response.json(data, {
      status: 200,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return orderErrorResponse(error, correlationId);
  }
}
