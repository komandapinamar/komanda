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

export function formatReelPrice(price: number, currency: string = "ARS"): string {
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
      className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-end"
    >
      {/* Scrim bottom gradient of at least 340px height */}
      <div
        data-testid="reel-scrim-bottom"
        className="absolute bottom-0 left-0 right-0 h-[380px] min-h-[340px] pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.65) 45%, rgba(0,0,0,0.15) 80%, transparent 100%)",
        }}
      />

      {/* Optional action rail slot on right side */}
      {actionRailSlot ? (
        <div className="absolute right-4 bottom-28 z-25 pointer-events-auto">
          {actionRailSlot}
        </div>
      ) : null}

      {/* Card details with strict immutable order: 1. Price -> 2. Title -> 3. Description */}
      <div
        data-testid="reel-overlay-content"
        className={`relative z-20 px-5 flex flex-col gap-1.5 transition-all duration-300 max-w-[calc(100%-74px)] ${
          isCartActive ? "pb-28" : "pb-8"
        }`}
      >
        {/* 1. PRECIO */}
        <div
          data-testid="reel-price"
          className="text-2xl font-black text-white tracking-tight flex items-baseline gap-1 drop-shadow-md"
        >
          <span className="text-lg font-bold text-[#22c55e]">$</span>
          <span>{formattedPrice}</span>
        </div>

        {/* 2. TÍTULO */}
        <h2
          data-testid="reel-title"
          className="text-xl font-extrabold text-white leading-tight drop-shadow-md"
        >
          {title}
        </h2>

        {/* 3. DESCRIPCIÓN */}
        {description ? (
          <p
            data-testid="reel-description"
            className="text-sm text-white/85 line-clamp-3 leading-relaxed drop-shadow-sm"
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
