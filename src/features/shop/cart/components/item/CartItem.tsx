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
  const lineId = cartLine.lineId ?? item.documentId;
  const optionsSummary = item.selectedOptionSummary;
  const selectedOptions = item.selectedOptions ?? [];

  return (
    <>
      <div className="flex items-start justify-between gap-3.5">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#202024] ring-1 ring-white/12">
          {item.videoUrl && failedVideo !== item.videoUrl ? (
            <video
              src={item.videoUrl}
              poster={
                item.image && failedImage !== item.image
                  ? item.image
                  : undefined
              }
              playsInline
              muted
              loop
              controls={false}
              disablePictureInPicture
              disableRemotePlayback
              controlsList="nodownload nofullscreen noremoteplayback"
              preload="metadata"
              aria-label={`Video de ${item.name}`}
              onError={() => setFailedVideo(item.videoUrl ?? null)}
              className="pointer-events-none h-full w-full object-cover select-none"
            />
          ) : item.image && failedImage !== item.image ? (
            <Image
              src={item.image}
              alt={item.name}
              fill
              unoptimized
              sizes="80px"
              onError={() => setFailedImage(item.image)}
              className="object-cover"
            />
          ) : (
            <div
              className="flex h-full items-center justify-center text-white/30"
              aria-label="Producto sin imagen"
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="m3 17 6-6 4 4 3-3 5 5" />
                <circle cx="16" cy="8" r="1.5" />
              </svg>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="break-words text-sm font-medium tracking-tight text-[#f4f3f1]">
            {quantity} × {item.name}
          </h3>
          {selectedOptions.length > 0 ? (
            <div className="space-y-0.5 pt-0.5">
              <p className="text-[11px] font-medium text-[#c2c2cc]">
                Adicionales
              </p>
              <ul className="space-y-0.5">
                {selectedOptions.map((option) => (
                  <li
                    key={option.id}
                    className="flex items-start justify-between gap-2 text-xs text-[#d4d4dc] tabular-nums"
                  >
                    <span className="break-words">• {option.name}</span>
                    {option.priceDelta && option.priceDelta > 0 ? (
                      <span className="shrink-0 font-medium text-emerald-400">
                        +${option.priceDelta.toLocaleString("es-AR")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : optionsSummary ? (
            <p className="break-words text-xs text-[#c2c2cc]">
              {optionsSummary}
            </p>
          ) : null}
          <p className="text-xs text-[#c2c2cc] tabular-nums">
            ${item.price.toLocaleString("es-AR")} c/u
          </p>
          <button
            type="button"
            onClick={() => removeItem(lineId)}
            aria-label={`Quitar ${item.name}`}
            className="text-xs text-[#c2c2cc] underline decoration-white/25 underline-offset-4 transition hover:text-[#f4f3f1] cursor-pointer"
          >
            Quitar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] p-0.5">
          <button
            type="button"
            onClick={() => decrementItem(lineId)}
            aria-label={`Reducir cantidad de ${item.name}`}
            className="flex size-7 items-center justify-center rounded-full text-sm font-medium text-[#f4f3f1] transition hover:bg-white/12 cursor-pointer"
          >
            -
          </button>
          <span className="min-w-6 text-center text-xs font-medium tabular-nums text-[#f4f3f1]">
            {cartLine.quantity}
          </span>
          <button
            type="button"
            onClick={() => addItem(cartLine.item)}
            aria-label={`Aumentar cantidad de ${item.name}`}
            className="flex size-7 items-center justify-center rounded-full text-sm font-medium text-[#f4f3f1] transition hover:bg-white/12 cursor-pointer"
          >
            +
          </button>
        </div>

        <p className="text-sm font-semibold tabular-nums text-[#f4f3f1]">
          ${(item.price * quantity).toLocaleString("es-AR")}
        </p>
      </div>
    </>
  );
}
