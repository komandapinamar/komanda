import { z } from "zod";
import { CartService } from "@/features/cart/application/cart.service";
import { cartErrorResponse } from "@/features/cart/web/cart-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantSlug: string; cartId: string }>;
};

const ApplyDiscountPayloadSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Discount code is required"),
});

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantSlug, cartId } = await route.params;
    const body = await request.json().catch(() => ({}));
    const { code } = ApplyDiscountPayloadSchema.parse(body);

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const cart = await new CartService().applyDiscount(
      tenantSlug,
      cartId,
      code,
      clientIp,
    );

    return Response.json(cart, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return cartErrorResponse(error, correlationId);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantSlug, cartId } = await route.params;
    const cart = await new CartService().removeDiscount(tenantSlug, cartId);

    return Response.json(cart, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return cartErrorResponse(error, correlationId);
  }
}
