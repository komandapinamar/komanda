"use client";

import { useState } from "react";
import CartPanel from "@/features/shop/cart/components/CartPanel";
import { useCart } from "@/features/shop/cart/context/cart.context";

export default function MobileCartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const { itemCount, subtotal } = useCart();

  return (
    <>
      <div className="fixed inset-x-4 bottom-4 z-30 lg:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="liquid-prism-ring liquid-glass-pill mx-auto flex w-full max-w-md items-center justify-between rounded-full p-1.5 pl-4 text-left text-[#f4f3f1] transition active:scale-[0.98]"
        >
          <span className="text-sm font-medium tracking-tight">
            Ver carrito ({itemCount} {itemCount === 1 ? "item" : "items"})
          </span>
          <span className="rounded-full bg-[#f4f3f1] px-4 py-2 text-xs font-semibold tabular-nums text-[#141416]">
            ${subtotal}
          </span>
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar carrito"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />

          <div className="absolute inset-x-0 bottom-0 h-[85vh] rounded-t-3xl bg-transparent p-2">
            <div className="flex h-full flex-col overflow-hidden">
              <div className="min-h-0 flex-1">
                <CartPanel />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
