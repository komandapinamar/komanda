"use client";

import { useCart } from "../../context/cart.context";
import type { CartLine } from "@/types/types";

export default function CartItem({ cartLine }: { cartLine: CartLine }) {
  const { addItem, decrementItem, removeItem } = useCart();

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{cartLine.item.name}</h3>
          <p className="text-sm opacity-80">${cartLine.item.price} c/u</p>
        </div>

        <button
          type="button"
          onClick={() => removeItem(cartLine.item.documentId)}
          className="text-sm font-semibold underline underline-offset-2"
        >
          Quitar
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => decrementItem(cartLine.item.documentId)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-accent-secondary)] text-lg font-bold"
          >
            -
          </button>
          <span className="min-w-6 text-center font-semibold">
            {cartLine.quantity}
          </span>
          <button
            type="button"
            onClick={() => addItem(cartLine.item)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-accent-secondary)] text-lg font-bold"
          >
            +
          </button>
        </div>

        <p className="text-lg font-bold">
          ${cartLine.item.price * cartLine.quantity}
        </p>
      </div>
    </>
  );
}