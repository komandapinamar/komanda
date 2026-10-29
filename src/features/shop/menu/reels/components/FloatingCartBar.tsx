"use client";

import { useCallback, type MouseEvent } from "react";
import { formatReelPrice } from "./ReelOverlay";
import { useBrowserChromeOffset } from "../hooks/useBrowserChromeOffset";

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
  const chromeOffset = useBrowserChromeOffset();

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement | HTMLButtonElement>) => {
      e.stopPropagation();
      onOpenCart?.();
    },
    [onOpenCart],
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
      className={`group liquid-prism-ring liquid-glass-pill fixed left-3.5 right-3.5 z-35 mx-auto flex max-w-[calc(100vw-1.75rem)] items-center justify-between rounded-full p-1.5 pl-4 text-[#f4f3f1] select-none cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/25 active:scale-[0.98] sm:max-w-md md:bottom-[calc(4vh+1rem)] md:max-w-[26rem] ${
        isVisible
          ? "translate-y-0 scale-100 opacity-100 pointer-events-auto"
          : "translate-y-32 scale-95 opacity-0 pointer-events-none invisible"
      }`}
      style={{
        borderRadius: "9999px",
        bottom: `calc(${chromeOffset}px + env(safe-area-inset-bottom, 0px) + 1rem)`,
      }}
    >
      {/* Left: Dabbit-style status indicator + count + refined label */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          data-testid="floating-cart-count"
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-xs font-medium tabular-nums text-[#f4f3f1]"
        >
          {itemCount}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-[#ff4d2d]"
          />
          <span
            data-testid="floating-cart-label"
            className="truncate text-sm font-medium tracking-tight text-[#f4f3f1]"
          >
            {itemCount === 1
              ? "1 producto en pedido"
              : `${itemCount} productos en pedido`}
          </span>
        </div>
      </div>

      {/* Right: Warm Alabaster Pill CTA with Subtotal & Arrow */}
      <div className="flex shrink-0 items-center gap-2 rounded-full bg-[#f4f3f1] px-4 py-2 text-[#141416] shadow-sm transition duration-200 group-hover:bg-white">
        <span
          data-testid="floating-cart-subtotal"
          className="text-sm font-semibold tracking-tight tabular-nums text-[#141416]"
        >
          ${formattedSubtotal}
        </span>
        <span className="text-xs text-[#141416]/40">·</span>
        <span className="text-xs font-medium text-[#141416]">Ver pedido</span>
        <svg
          className="size-3.5 text-[#141416] transition-transform duration-200 group-hover:translate-x-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
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
