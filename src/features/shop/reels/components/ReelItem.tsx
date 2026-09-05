"use client";

import { useState, useCallback } from "react";
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
  onLike?: (item: MenuItem) => void;
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
  onLike,
  onOpenModifiers,
  onOpenInfo,
}: ReelItemProps) {
  const resolvedCategoryId = categoryId ?? item.category?.documentId;
  const isCartActive = hasCartItems || withCart;
  const cartContext = useOptionalCart();

  const [showHeart, setShowHeart] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  const handleAction = useCallback(() => {
    if (item.hasOptions) {
      if (onOpenModifiers) {
        onOpenModifiers(item);
      } else if (onLike) {
        onLike(item);
      }
      return;
    }

    // Simple item
    if (onLike) {
      onLike(item);
    } else if (cartContext) {
      cartContext.addItem(item);
    }

    // Heart burst animation & button elastic feedback
    setShowHeart(true);
    setIsLiked(true);
    setTimeout(() => setShowHeart(false), 650);
    setTimeout(() => setIsLiked(false), 800);
  }, [cartContext, item, onLike, onOpenModifiers]);

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
      onLike={handleAction}
      isLiked={isLiked}
      showHeart={showHeart}
      onOpenInfo={() => onOpenInfo?.(item)}
    />
  );

  return (
    <article
      ref={itemRef}
      data-testid="reel-item"
      data-id={item.documentId}
      data-category-id={resolvedCategoryId}
      role="region"
      aria-label={`Plato: ${item.name}, Precio: $${item.price}`}
      onClick={handleTap}
      onTouchEnd={handleTap}
      className="relative w-full h-[100dvh] overflow-hidden flex flex-col justify-end [scroll-snap-align:start] [scroll-snap-stop:always] shrink-0 select-none bg-black"
      style={{
        scrollSnapAlign: "start",
        scrollSnapStop: "always",
        touchAction: "pan-y",
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
