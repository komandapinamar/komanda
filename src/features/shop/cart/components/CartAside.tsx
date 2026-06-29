"use client";

import CartPanel from "@/features/shop/cart/components/CartPanel";

export default function CartAside() {
  return (
    <aside className="sticky top-4 h-[calc(100dvh-2rem)]">
      <CartPanel />
    </aside>
  );
}
