"use client";

import { useState, useCallback, useMemo } from "react";
import type { MenuItem } from "@/types/types";
import ReelMedia from "./ReelMedia";
import ReelOverlay from "./ReelOverlay";
import ReelActionRail from "./ReelActionRail";
import { useDoubleTap } from "../hooks/useDoubleTap";
import { useOptionalCart } from "@/features/shop/cart/context/cart.context";

export interface ReelItemProps {
  item: MenuItem;
  categoryId?: string;
  hasCartItems?: boolean;
  withCart?: boolean;
  videoRef?: React.Ref<HTMLVideoElement>;
  itemRef?: React.Ref<HTMLDivElement>;
  actionRailSlot?: React.ReactNode;
  onAddToCart?: (item: MenuItem) => void;
  onOpenModifiers?: (item: MenuItem) => void;
  onOpenInfo?: (item: MenuItem) => void;
}

export default function ReelItem({
  item,
  categoryId,
  hasCartItems = false,
  withCart = false,
  videoRef,
  itemRef,
  actionRailSlot,
  onAddToCart,
  onOpenModifiers,
  onOpenInfo,
}: ReelItemProps) {
  const resolvedCategoryId = categoryId ?? item.category?.documentId;
  const isCartActive = hasCartItems || withCart;
  const cartContext = useOptionalCart();

  const quantityInCart = useMemo(() => {
    if (!cartContext) return 0;
    return (
      cartContext.items.find(
        (cartLine) => cartLine.item.documentId === item.documentId
      )?.quantity ?? 0
    );
  }, [cartContext, item.documentId]);

  const [showBurst, setShowBurst] = useState(false);

  const handleAction = useCallback(() => {
    if (item.hasOptions) {
      if (onOpenModifiers) {
        onOpenModifiers(item);
      } else if (onAddToCart) {
        onAddToCart(item);
      }
      return;
    }

    if (onAddToCart) {
      onAddToCart(item);
    } else if (cartContext) {
      cartContext.addItem(item);
    }

    // Cart burst animation feedback (state itself persists in the cart)
    setShowBurst(true);
    setTimeout(() => setShowBurst(false), 650);
  }, [cartContext, item, onAddToCart, onOpenModifiers]);

  const handleTap = useDoubleTap(
    (event) => {
      const target = event.target as HTMLElement | null;
      // Do not trigger if tapped on an interactive button or control
      if (target?.closest("button, a, [role='button'], input, textarea, select")) {
        return;
      }
      handleAction();
    },
    { threshold: 280 }
  );

  const resolvedActionRail = actionRailSlot ?? (
    <ReelActionRail
      item={item}
      onAddToCart={handleAction}
      isInCart={quantityInCart > 0}
      quantity={quantityInCart}
      showBurst={showBurst}
      onOpenInfo={() => onOpenInfo?.(item)}
    />
  );

  return (
    <article
      ref={itemRef}
      data-testid="reel-item"
      data-id={item.documentId}
      data-item-id={item.documentId}
      data-category-id={resolvedCategoryId}
      role="region"
      aria-label={`Plato: ${item.name}, Precio: $${item.price}`}
      onClick={handleTap}
      onTouchEnd={handleTap}
      className="relative w-full h-[100dvh] overflow-hidden flex flex-col justify-end [scroll-snap-align:start] [scroll-snap-stop:always] shrink-0 select-none bg-black"
      style={{
        scrollSnapAlign: "start",
        scrollSnapStop: "always",
        touchAction: "manipulation",
      }}
    >
      <ReelMedia
        image={item.image}
        videoUrl={item.videoUrl}
        alt={item.name}
        videoRef={videoRef}
      />
      <ReelOverlay
        price={item.price}
        title={item.name}
        description={item.description}
        hasCartItems={isCartActive}
        withCart={isCartActive}
        actionRailSlot={resolvedActionRail}
      />
    </article>
  );
}
