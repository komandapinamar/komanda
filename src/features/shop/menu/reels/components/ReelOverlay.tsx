import type { ReactNode } from "react";

export interface ReelOverlayProps {
  price: number;
  title: string;
  description?: string | null;
  currency?: string;
  hasCartItems?: boolean;
  withCart?: boolean;
  actionRailSlot?: ReactNode;
}

export function formatReelPrice(
  price: number,
  currency: string = "ARS",
): string {
  try {
    return new Intl.NumberFormat("es-AR", {
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return price.toLocaleString();
  }
}

export default function ReelOverlay({
  price,
  title,
  description,
  currency = "ARS",
  hasCartItems = false,
  withCart = false,
  actionRailSlot,
}: ReelOverlayProps) {
  const formattedPrice = formatReelPrice(price, currency);
  const isCartActive = hasCartItems || withCart;

  return (
    <div
      data-testid="reel-overlay"
      className="pointer-events-none absolute inset-0 z-10 flex w-full max-w-full flex-col justify-end overflow-hidden pb-[env(safe-area-inset-bottom,0px)]"
    >
      {/* Scrim bottom gradient of at least 340px height */}
      <div
        data-testid="reel-scrim-bottom"
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[380px] min-h-[340px]"
        style={{
          background:
            "linear-gradient(to top, rgba(16,16,19,0.96) 0%, rgba(16,16,19,0.72) 45%, rgba(16,16,19,0.18) 80%, transparent 100%)",
        }}
      />

      {/* Action rail (+1 cart button) anchored safely inside bottom-right */}
      {actionRailSlot ? (
        <div
          className={`pointer-events-auto absolute right-4 z-25 transition-all duration-300 ${
            isCartActive ? "bottom-24" : "bottom-6"
          }`}
        >
          {actionRailSlot}
        </div>
      ) : null}

      {/* Card details with strict immutable order: 1. Price -> 2. Title -> 3. Description */}
      <div
        data-testid="reel-overlay-content"
        className={`relative z-20 flex w-full max-w-[calc(100%-76px)] min-w-0 flex-col gap-1.5 pl-4 pr-2 transition-all duration-300 ${
          isCartActive ? "pb-28" : "pb-8"
        }`}
      >
        <div className="liquid-glass-card min-w-0 overflow-hidden rounded-2xl p-3.5 space-y-1">
          {/* 1. PRECIO */}
          <div
            data-testid="reel-price"
            className="inline-flex items-baseline gap-0.5 rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-0.5 text-base font-semibold tracking-tight text-[#f4f3f1] tabular-nums"
          >
            <span className="text-xs font-medium text-[#9ec4b5]">$</span>
            <span>{formattedPrice}</span>
          </div>

          {/* 2. TÍTULO */}
          <h2
            data-testid="reel-title"
            className="truncate text-lg font-medium leading-tight tracking-tight text-[#f4f3f1] sm:text-xl"
          >
            {title}
          </h2>

          {/* 3. DESCRIPCIÓN */}
          {description ? (
            <p
              data-testid="reel-description"
              className="line-clamp-2 text-xs leading-relaxed text-[#d4d4dc]"
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
