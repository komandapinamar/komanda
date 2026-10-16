"use client";

import { useCallback, useState, type MouseEvent } from "react";
import type { MenuItem } from "@/types/types";
import { formatReelPrice } from "./ReelOverlay";

export interface ReelActionRailProps {
  item: MenuItem;
  onAddToCart?: () => void;
  isInCart?: boolean;
  quantity?: number;
  showBurst?: boolean;
  onOpenInfo?: () => void;
}

export default function ReelActionRail({
  item,
  onAddToCart,
  isInCart = false,
  quantity = 0,
  showBurst = false,
  onOpenInfo,
}: ReelActionRailProps) {
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const handleAddClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onAddToCart?.();
    },
    [onAddToCart]
  );

  const handleInfoClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (onOpenInfo) {
        onOpenInfo();
      } else {
        setIsInfoOpen(true);
      }
    },
    [onOpenInfo]
  );

  const handleCloseInfo = useCallback(
    (e?: MouseEvent) => {
      e?.stopPropagation();
      setIsInfoOpen(false);
    },
    []
  );

  return (
    <>
      {/* Micro-animation CSS keyframes for cart burst */}
      <style>{`
        @keyframes cartPop {
          0% { transform: scale(0.3); opacity: 0; }
          35% { transform: scale(1.35); opacity: 1; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .animate-cart-pop {
          animation: cartPop 650ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>

      {/* Floating cart burst animation (centered, 650ms, pointer-events: none) */}
      {showBurst ? (
        <div
          data-testid="reel-cart-pop"
          className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
          aria-hidden="true"
        >
          <div
            className="animate-cart-pop drop-shadow-[0_10px_25px_rgba(255,77,45,0.6)]"
            style={{ filter: "drop-shadow(0 10px 25px rgba(255, 77, 45, 0.6))" }}
          >
            <svg
              width="100"
              height="100"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ff4d2d"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="21" r="1" fill="#ff4d2d" stroke="none" />
              <circle cx="20" cy="21" r="1" fill="#ff4d2d" stroke="none" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </div>
        </div>
      ) : null}

      {/* Vertical Action Rail */}
      <div
        data-testid="reel-action-rail"
        className="flex flex-col gap-4 items-center z-25 select-none"
      >
        {/* Add to cart button (state persists while item is in cart) */}
        <button
          type="button"
          data-testid="action-btn-add"
          data-in-cart={String(isInCart)}
          aria-label={
            isInCart
              ? `${item.name} en el carrito (${quantity})`
              : `Agregar ${item.name} al carrito`
          }
          onClick={handleAddClick}
          className={`relative w-[50px] h-[50px] rounded-full flex flex-col items-center justify-center border transition-all duration-200 cursor-pointer shadow-lg active:scale-90 ${
            isInCart
              ? "bg-[#ff4d2d] border-[#ff4d2d] text-white shadow-[0_4px_20px_rgba(255,77,45,0.5)] scale-105"
              : "bg-[rgba(18,20,29,0.65)] backdrop-blur-md border-white/20 text-white hover:bg-[rgba(25,28,40,0.8)]"
          }`}
        >
          {isInCart && quantity > 0 ? (
            <span
              data-testid="action-cart-badge"
              className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-white text-black text-[11px] font-black leading-5 text-center shadow"
            >
              {quantity}
            </span>
          ) : null}
          <svg
            className="w-6 h-6 transition-transform"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="21" r="1" fill="currentColor" stroke="none" />
            <circle cx="20" cy="21" r="1" fill="currentColor" stroke="none" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span
            data-testid="action-add-label"
            className="text-[10px] font-bold tracking-tight leading-none mt-0.5"
          >
            +1
          </span>
        </button>

        {/* Dish Info Button */}
        <button
          type="button"
          data-testid="action-btn-info"
          aria-label="Información del plato"
          onClick={handleInfoClick}
          className="w-[50px] h-[50px] rounded-full flex flex-col items-center justify-center bg-[rgba(18,20,29,0.65)] backdrop-blur-md border border-white/20 text-white hover:bg-[rgba(25,28,40,0.8)] transition-all duration-200 cursor-pointer shadow-lg active:scale-90"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span
            data-testid="action-info-label"
            className="text-[9px] font-bold tracking-tight leading-none mt-0.5"
          >
            Info
          </span>
        </button>
      </div>

      {/* Dish Information Modal */}
      {isInfoOpen ? (
        <div
          data-testid="reel-info-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dish-info-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm pointer-events-auto"
          onClick={handleCloseInfo}
        >
          <div
            className="bg-[#161822] border border-white/16 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <h3
                  id="dish-info-title"
                  data-testid="dish-info-title"
                  className="text-lg font-extrabold leading-snug"
                >
                  {item.name}
                </h3>
                <span className="text-sm font-black text-[#22c55e]">
                  ${formatReelPrice(item.price)}
                </span>
              </div>
              <button
                type="button"
                data-testid="dish-info-close"
                onClick={handleCloseInfo}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-neutral-300 hover:text-white"
                aria-label="Cerrar información"
              >
                ✕
              </button>
            </div>

            <p
              data-testid="dish-info-description"
              className="text-sm text-neutral-300 leading-relaxed"
            >
              {item.description || "Sin descripción adicional de ingredientes para este plato."}
            </p>

            <button
              type="button"
              onClick={handleCloseInfo}
              className="w-full py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-bold text-white transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
