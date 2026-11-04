"use client";

import { useCallback, type MouseEvent } from "react";
import type { MenuItem } from "@/types/types";

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
}: ReelActionRailProps) {
  const handleAddClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onAddToCart?.();
    },
    [onAddToCart],
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
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          aria-hidden="true"
        >
          <div
            className="animate-cart-pop drop-shadow-[0_10px_25px_rgba(255,77,45,0.6)]"
            style={{
              filter: "drop-shadow(0 10px 25px rgba(255, 77, 45, 0.6))",
            }}
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

      {/* Vertical Action Rail (Add to Cart only) */}
      <div
        data-testid="reel-action-rail"
        className="z-25 flex flex-col items-center gap-4 select-none"
      >
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
          className={`relative flex h-[52px] w-[52px] flex-col items-center justify-center rounded-full border transition-all duration-200 active:scale-90 cursor-pointer shadow-lg ${
            isInCart
              ? "bg-[#ff4d2d] border-[#ff4d2d] text-white shadow-[0_6px_24px_rgba(255,77,45,0.5)] scale-105"
              : "liquid-glass-pill border-white/20 text-[#f4f3f1] hover:border-white/35 hover:scale-105"
          }`}
        >
          {isInCart && quantity > 0 ? (
            <span
              data-testid="action-cart-badge"
              className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] rounded-full bg-white px-1 text-center text-[11px] font-bold leading-5 text-[#141416] shadow"
            >
              {quantity}
            </span>
          ) : null}
          <svg
            className="h-5 w-5 transition-transform"
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
            className="mt-0.5 text-[10px] font-semibold leading-none tracking-tight"
          >
            +1
          </span>
        </button>
      </div>
    </>
  );
}
