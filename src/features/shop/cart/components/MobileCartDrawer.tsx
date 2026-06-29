"use client";

import { useState } from "react";
import CartPanel from "@/features/shop/cart/components/CartPanel";
import { useCart } from "@/features/shop/cart/context/cart.context";

export default function MobileCartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const { itemCount, subtotal } = useCart();

  return (
    <>
    {/* in big screen it's hidden, only showing in mobile*/}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-4 shadow-2xl lg:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center justify-between rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 text-left text-[var(--color-accent-primary)]"
        >
          <span>
            Ver carrito ({itemCount} {itemCount === 1 ? "item" : "items"})
          </span>
          <span className="font-semibold">${subtotal}</span>
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar carrito"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-[var(--color-accent-primary)]/70"
          />

          <div className="absolute inset-x-0 bottom-0 h-[85vh] rounded-t-2xl bg-transparent p-2">
            <div className="flex h-full flex-col overflow-hidden rounded-t-2xl">
              <div className="flex justify-center bg-[var(--color-accent-primary)] pt-3">
                <div className="h-1.5 w-14 rounded-full bg-[var(--color-accent-secondary)]/40" />
              </div>
              <div className="flex items-center justify-between bg-[var(--color-accent-primary)] px-4 pb-3 pt-2 text-[var(--color-accent-secondary)]">
                <h2 className="text-lg font-bold">Tu carrito</h2>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="font-semibold"
                >
                  Cerrar
                </button>
              </div>

              <div className="min-h-0 flex-1 bg-[var(--color-accent-primary)]">
                <CartPanel />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
