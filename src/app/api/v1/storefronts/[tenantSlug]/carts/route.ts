import { CartService } from "@/features/cart/application/cart.service";
import { cartErrorResponse } from "@/features/cart/web/cart-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return Response.json(
        { code: "IDEMPOTENCY_KEY_REQUIRED", correlationId },
        { status: 422 },
      );
    }
    const { tenantSlug } = await route.params;
    const cart = await new CartService().create(
      tenantSlug,
      await request.json(),
      idempotencyKey,
    );
    return Response.json(cart, {
      status: 201,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return cartErrorResponse(error, correlationId);
  }
}
