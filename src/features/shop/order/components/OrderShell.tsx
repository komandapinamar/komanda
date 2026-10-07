"use client";

import type { ReactNode } from "react";
import CartAside from "@/features/shop/cart/components/CartAside";
import MobileCartDrawer from "@/features/shop/cart/components/MobileCartDrawer";

export interface OrderShellProps {
  children?: ReactNode;
  showCart?: boolean;
}

export default function OrderShell({
  children,
  showCart = true,
}: OrderShellProps) {
  return (
    <div className="min-h-[100dvh] bg-[var(--color-accent-primary)]">
      {showCart ? (
        <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6">
          <div className="min-w-0 p-4 pb-24 lg:pb-6 lg:pr-0">{children}</div>
          <div className="hidden p-4 pl-0 lg:block">
            <CartAside />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl">
          <div className="min-w-0 p-4 pb-6">{children}</div>
        </div>
      )}
      {showCart ? <MobileCartDrawer /> : null}
    </div>
  );
}
