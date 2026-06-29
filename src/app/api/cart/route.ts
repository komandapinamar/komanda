import type { OfficialCartLine } from "@/types/types";
import { NextResponse } from "next/server";
import { getMenuItem } from "@/features/shop/menu/services/menu.service";
import { saveOfficialCart } from "@/features/shop/cart/server/cart.store";

type CartRequestItem = {
  documentId: string;
  quantity: number;
};

async function fetchItems(items: CartRequestItem[]): Promise<OfficialCartLine[]> {
  return Promise.all(
    items.map(async (item) => {
      const strapiItem = await getMenuItem(item.documentId);

      return {
        documentId: strapiItem.documentId,
        quantity: item.quantity,
        name: strapiItem.name,
        unitPrice: strapiItem.price,
        lineTotal: strapiItem.price * item.quantity,
        image: strapiItem.image,
        available: true,
        note: strapiItem.description ?? undefined,
      };
    }),
  );
}

export async function POST(request: Request) {
  const { items } = (await request.json()) as { items?: CartRequestItem[] };

  if (!Array.isArray(items)) {
    return NextResponse.json(
      { error: "Items must be an array with format { documentId: string, quantity: number }" },
      { status: 400 },
    );
  }

  const cartItems = await fetchItems(items);
  const subtotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const cartId = crypto.randomUUID();
  const cart = {
    id: cartId,
    cartId,
    currency: "ARS",
    items: cartItems,
    subtotal,
    discountTotal: 0,
    total: subtotal,
    updatedAt: new Date().toISOString(),
  };

  const persistedCart = await saveOfficialCart({
    id: cart.id,
    currency: cart.currency,
    items: cart.items,
    subtotal: cart.subtotal,
    discountTotal: cart.discountTotal,
    total: cart.total,
    updatedAt: cart.updatedAt,
  });

  return NextResponse.json({
    id: persistedCart.id,
    cartId: persistedCart.id,
    currency: persistedCart.currency,
    items: persistedCart.items,
    subtotal: persistedCart.subtotal,
    discountTotal: persistedCart.discountTotal,
    total: persistedCart.total,
    updatedAt: persistedCart.updatedAt,
    expiresAt: persistedCart.expiresAt,
  });
}