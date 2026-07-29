import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { OrderQueryService } from "@/features/orders/application/order-query.service";
import { TransitionOrderService } from "@/features/orders/application/transition-order.service";
import {
  orderErrorResponse,
  orderVersionFromRequest,
} from "@/features/orders/web/order-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string; orderId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, orderId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    return Response.json(await new OrderQueryService().get(context, orderId), {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return orderErrorResponse(error, correlationId);
  }
}

export async function PATCH(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, orderId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    const order = await new TransitionOrderService().transition({
      context,
      orderId,
      expectedVersion: orderVersionFromRequest(request),
      body: await request.json(),
    });
    return Response.json(order, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return orderErrorResponse(error, correlationId);
  }
}
