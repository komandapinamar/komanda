import { headers } from "next/headers";
import type { ReactNode } from "react";
import { CartProvider } from "@/features/shop/cart/context/cart.context";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const tenantSlug =
    (await headers()).get("x-komanda-tenant-slug") ??
    process.env.MOCK_TENANT_SLUG ??
    "";
  return <CartProvider tenantSlug={tenantSlug}>{children}</CartProvider>;
}
