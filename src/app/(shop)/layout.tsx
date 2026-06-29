"use client";

import type { ReactNode } from "react";
import { CartProvider } from "@/features/shop/cart/context/cart.context";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
