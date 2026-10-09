"use client";

import { useCart } from "../../context/cart.context";
import type { CartLine } from "@/types/types";
import Image from "next/image";
import { useState } from "react";

export default function CartItem({ cartLine }: { cartLine: CartLine }) {
  const { addItem, decrementItem, removeItem } = useCart();
  const [failedVideo, setFailedVideo] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const { item, quantity } = cartLine;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-sm border border-black/10 bg-black/5">
          {item.videoUrl && failedVideo !== item.videoUrl ? (
            <video
              src={item.videoUrl}
              poster={item.image && failedImage !== item.image ? item.image : undefined}
              controls
              playsInline
              muted
              preload="metadata"
              aria-label={`Video de ${item.name}`}
              onError={() => setFailedVideo(item.videoUrl ?? null)}
              className="h-full w-full object-cover"
            />
          ) : item.image && failedImage !== item.image ? (
            <Image src={item.image} alt={item.name} fill unoptimized sizes="80px" onError={() => setFailedImage(item.image)} className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-black/30" aria-label="Producto sin imagen">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="m3 17 6-6 4 4 3-3 5 5" />
                <circle cx="16" cy="8" r="1.5" />
              </svg>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="break-words text-sm font-bold uppercase">{quantity} × {item.name}</h3>
          <p className="text-xs opacity-60">${item.price.toLocaleString("es-AR")} c/u</p>
          <button
            type="button"
            onClick={() => removeItem(cartLine.item.documentId)}
            aria-label={`Quitar ${item.name}`}
            className="text-xs opacity-60 underline underline-offset-2 hover:opacity-100"
          >
            Quitar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => decrementItem(cartLine.item.documentId)}
            aria-label={`Reducir cantidad de ${item.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-current/25 text-lg font-bold hover:bg-black/5"
          >
            -
          </button>
          <span className="min-w-6 text-center font-semibold">
            {cartLine.quantity}
          </span>
          <button
            type="button"
            onClick={() => addItem(cartLine.item)}
            aria-label={`Aumentar cantidad de ${item.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-current/25 text-lg font-bold hover:bg-black/5"
          >
            +
          </button>
        </div>

        <p className="text-base font-bold tabular-nums">
          ${(item.price * quantity).toLocaleString("es-AR")}
        </p>
      </div>
    </>
  );
}
