import { headers } from "next/headers";
import type { ReactNode } from "react";
import { CartProvider } from "@/features/shop/cart/context/cart.context";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const tenantSlug = (await headers()).get("x-komanda-tenant-slug") ?? "";
  if (!tenantSlug) {
    throw new Error("An explicit tenant storefront is required.");
  }
  return <CartProvider tenantSlug={tenantSlug}>{children}</CartProvider>;
}
