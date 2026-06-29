import { NextResponse } from "next/server";
import { getOfficialCartById } from "@/features/shop/cart/server/cart.store";

type RouteContext = {
  params: Promise<{
    cartId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { cartId } = await context.params;
  const cart = await getOfficialCartById(cartId);

  if (!cart) {
    return NextResponse.json(
      { error: `Cart "${cartId}" was not found or has expired.` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: cart.id,
    cartId: cart.id,
    currency: cart.currency,
    items: cart.items,
    subtotal: cart.subtotal,
    discountTotal: cart.discountTotal,
    total: cart.total,
    updatedAt: cart.updatedAt,
    expiresAt: cart.expiresAt,
  });
}
