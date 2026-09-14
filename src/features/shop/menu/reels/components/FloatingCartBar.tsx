"use client";

import { useCallback, type MouseEvent } from "react";
import { formatReelPrice } from "./ReelOverlay";

export interface FloatingCartBarProps {
  itemCount: number;
  subtotal: number;
  currency?: string;
  onOpenCart?: () => void;
}

export default function FloatingCartBar({
  itemCount,
  subtotal,
  currency = "ARS",
  onOpenCart,
}: FloatingCartBarProps) {
  const isVisible = itemCount > 0;
  const formattedSubtotal = formatReelPrice(subtotal, currency);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement | HTMLButtonElement>) => {
      e.stopPropagation();
      onOpenCart?.();
    },
    [onOpenCart]
  );

  return (
    <div
      data-testid="floating-cart-bar"
      role="button"
      tabIndex={isVisible ? 0 : -1}
      aria-live="polite"
      aria-label={`Ver carrito, ${itemCount} ${
        itemCount === 1 ? "producto" : "productos"
      }, total $${formattedSubtotal}`}
      onClick={isVisible ? handleClick : undefined}
      className={`fixed bottom-4 left-4 right-4 max-w-md mx-auto z-35 flex items-center justify-between px-5 py-3.5 bg-[#ff4d2d] text-white rounded-full shadow-[0_12px_36px_rgba(255,77,45,0.45)] cursor-pointer select-none transition-all duration-300 ease-out active:scale-[0.98] ${
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-32 opacity-0 pointer-events-none invisible"
      }`}
      style={{
        backgroundColor: "#ff4d2d",
        borderRadius: "9999px",
      }}
    >
      {/* Left: Cart badge & item count */}
      <div className="flex items-center gap-3">
        <div
          data-testid="floating-cart-count"
          className="w-7 h-7 rounded-full bg-black/25 flex items-center justify-center font-extrabold text-xs"
        >
          {itemCount}
        </div>
        <span
          data-testid="floating-cart-label"
          className="font-bold text-sm tracking-tight"
        >
          {itemCount === 1 ? "1 producto en pedido" : `${itemCount} productos en pedido`}
        </span>
      </div>

      {/* Right: Subtotal & arrow */}
      <div className="flex items-center gap-2">
        <span
          data-testid="floating-cart-subtotal"
          className="font-extrabold text-base tracking-tight"
        >
          ${formattedSubtotal}
        </span>
        <svg
          className="w-5 h-5 text-white/90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
