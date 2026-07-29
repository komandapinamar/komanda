import { CartService } from "@/features/cart/application/cart.service";
import { cartErrorResponse } from "@/features/cart/web/cart-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantSlug: string; cartId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantSlug, cartId } = await route.params;
    const cart = await new CartService().get(tenantSlug, cartId);
    return Response.json(cart, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return cartErrorResponse(error, correlationId);
  }
}
