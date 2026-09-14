import { CreateOrderService } from "@/features/orders/application/create-order.service";
import { OrderQueryService } from "@/features/orders/application/order-query.service";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { problemResponse } from "@/lib/http/problem";
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
    const page = await new OrderQueryService().list({
      context,
      status: url.searchParams.get("status"),
      cursor: url.searchParams.get("cursor"),
    });
    return Response.json(page, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return orderErrorResponse(error, correlationId);
  }
}

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
    const order = await new CreateOrderService().createDirect(
      context,
      await request.json(),
      idempotencyKey,
    );
    return Response.json(order, {
      status: 201,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return orderErrorResponse(error, correlationId);
  }
}
