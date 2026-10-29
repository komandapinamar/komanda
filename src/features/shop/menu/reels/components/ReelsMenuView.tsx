"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import MenuViewToolbar from "../../MenuViewToolbar";
import type { Category, MenuItem } from "@/types/types";
import MenuAnalyticsTracker from "@/features/shop/analytics/MenuAnalyticsTracker";
import ReelFeedContainer from "./ReelFeedContainer";
import ReelItem from "./ReelItem";
import ReelsCategoryNav from "./ReelsCategoryNav";
import FloatingCartBar from "./FloatingCartBar";
import ProductModifierSheet from "./ProductModifierSheet";
import CartPanel from "@/features/shop/cart/components/CartPanel";
import { useOptionalCart } from "@/features/shop/cart/context/cart.context";
import { useReelsMediaLifecycle } from "../hooks/useReelsMediaLifecycle";
import { useBrowserChromeOffset } from "../hooks/useBrowserChromeOffset";

export interface ReelsMenuViewProps {
  categories: Category[];
  items: MenuItem[];
  tenantSlug?: string;
  orderingAvailable?: boolean;
}

export default function ReelsMenuView({
  categories,
  items,
  tenantSlug,
  orderingAvailable = true,
}: ReelsMenuViewProps) {
  const cartContext = useOptionalCart();
  const itemCount = cartContext?.itemCount ?? 0;
  const subtotal = cartContext?.subtotal ?? 0;
  const addItem = cartContext?.addItem;
  const chromeOffset = useBrowserChromeOffset();

  const [selectedItemForModifiers, setSelectedItemForModifiers] =
    useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const targetItemId = params.get("item");
    if (!targetItemId) return;

    let highlightTimer: NodeJS.Timeout | undefined;

    const scrollTimer = setTimeout(() => {
      try {
        const safeId =
          typeof CSS !== "undefined" && CSS.escape
            ? CSS.escape(targetItemId)
            : targetItemId;
        const el = document.querySelector(`[data-item-id="${safeId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add(
            "ring-2",
            "ring-[var(--color-accent-secondary)]",
            "transition-all",
            "duration-500",
          );
          highlightTimer = setTimeout(() => {
            el.classList.remove(
              "ring-2",
              "ring-[var(--color-accent-secondary)]",
            );
          }, 2500);
        }
      } catch {
        // Ignore selector errors
      }
    }, 400);

    return () => {
      clearTimeout(scrollTimer);
      if (highlightTimer) clearTimeout(highlightTimer);
    };
  }, []);

  const initialCategoryId = useMemo(() => {
    if (categories.length > 0) {
      return categories[0].documentId;
    }
    return items[0]?.category?.documentId ?? null;
  }, [categories, items]);

  const {
    activeCategoryId,
    registerReelElement,
    registerVideoElement,
    setActiveCategoryId,
  } = useReelsMediaLifecycle({
    initialCategoryId,
  });

  const handleAddToCart = useCallback(
    (item: MenuItem) => {
      if (item.hasOptions) {
        setSelectedItemForModifiers(item);
      } else {
        addItem?.(item);
      }
    },
    [addItem],
  );

  const handleConfirmModifiers = useCallback(
    (configuredItem: MenuItem) => {
      addItem?.(configuredItem);
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          setSelectedItemForModifiers(null);
        }, 240);
      } else {
        setSelectedItemForModifiers(null);
      }
    },
    [addItem],
  );

  const handleCloseModifiers = useCallback(() => {
    setSelectedItemForModifiers(null);
  }, []);

  const handleOpenCart = useCallback(() => {
    setIsCartOpen(true);
  }, []);

  const handleCloseCart = useCallback(() => {
    setIsCartOpen(false);
  }, []);

  const scrollFeedByStep = useCallback((direction: -1 | 1) => {
    if (typeof document === "undefined") return;
    const container = document.querySelector(
      '[data-testid="reel-feed-container"]',
    ) as HTMLElement | null;
    if (!container) return;
    container.scrollBy({
      top: direction * container.clientHeight,
      behavior: "smooth",
    });
  }, []);

  return (
    <div
      data-testid="reels-menu-view"
      className="relative h-[100dvh] w-full overflow-hidden bg-[#141416] text-[#f4f3f1]"
    >
      {tenantSlug ? <MenuAnalyticsTracker tenantSlug={tenantSlug} /> : null}

      <ReelFeedContainer>
        {/* Reels vertical feed */}
        {items.length > 0 ? (
          items.map((item, index) => {
            const categoryId = item.category?.documentId;
            return (
              <ReelItem
                key={item.documentId}
                item={item}
                categoryId={categoryId}
                hasCartItems={itemCount > 0}
                withCart={itemCount > 0}
                onAddToCart={handleAddToCart}
                onOpenModifiers={(it) => setSelectedItemForModifiers(it)}
                itemRef={(el) =>
                  registerReelElement(item.documentId, el, {
                    categoryId,
                    index,
                  })
                }
                videoRef={(el) => registerVideoElement(item.documentId, el)}
              />
            );
          })
        ) : (
          <div
            data-testid="reels-empty-state"
            className="flex min-h-[100dvh] flex-1 flex-col items-center justify-center space-y-3 p-6 text-center md:min-h-full"
          >
            <div className="liquid-glass-pill flex size-14 items-center justify-center rounded-full text-xl">
              ✦
            </div>
            <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
              Menú en preparación
            </h2>
            <p className="max-w-xs text-sm text-[#c2c2cc]">
              Pronto podrás ver y pedir todos los platos de nuestra carta aquí.
            </p>
          </div>
        )}
      </ReelFeedContainer>

      {/* Persistent top UI layer: never scrolls away with the feed */}
      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center md:p-4">
        <div className="relative h-full w-full md:h-[92vh] md:max-w-md md:overflow-hidden md:rounded-[36px]">
          {/* Scrim gradient top for nav readability */}
          <div
            data-testid="reel-scrim-top"
            className="pointer-events-none absolute top-0 left-0 right-0 z-20 h-[130px]"
            style={{
              background:
                "linear-gradient(to bottom, rgba(20,20,22,0.88) 0%, rgba(20,20,22,0.35) 60%, transparent 100%)",
            }}
          />

          <div className="absolute top-3.5 left-3.5 right-3.5 z-40">
            <MenuViewToolbar mode="reels">
              <ReelsCategoryNav
                categories={categories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={setActiveCategoryId}
              />
            </MenuViewToolbar>
          </div>

          {!orderingAvailable ? (
            <div className="liquid-glass-pill absolute top-18 left-4 right-4 z-30 rounded-full px-4 py-2 text-center text-xs font-medium text-amber-200">
              Pedidos online no disponibles temporalmente.
            </div>
          ) : null}
        </div>

        {/* Desktop PC Navigation Controls outside the Reel stage */}
        {items.length > 1 ? (
          <div className="pointer-events-auto hidden md:flex flex-col gap-2.5 ml-5">
            <button
              type="button"
              onClick={() => scrollFeedByStep(-1)}
              aria-label="Plato anterior"
              title="Plato anterior"
              className="liquid-glass-pill flex size-11 items-center justify-center rounded-full text-[#f4f3f1] transition duration-200 hover:scale-105 hover:border-white/30 active:scale-95 cursor-pointer"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollFeedByStep(1)}
              aria-label="Siguiente plato"
              title="Siguiente plato"
              className="liquid-glass-pill flex size-11 items-center justify-center rounded-full text-[#f4f3f1] transition duration-200 hover:scale-105 hover:border-white/30 active:scale-95 cursor-pointer"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {/* Floating contextual checkout bar */}
      <FloatingCartBar
        itemCount={itemCount}
        subtotal={subtotal}
        onOpenCart={handleOpenCart}
      />

      {/* Bottom Sheet modal for product modifiers / sauces */}
      {selectedItemForModifiers ? (
        <ProductModifierSheet
          key={selectedItemForModifiers.documentId}
          item={selectedItemForModifiers}
          isOpen={true}
          onConfirm={handleConfirmModifiers}
          onClose={handleCloseModifiers}
        />
      ) : null}

      {/* Cart Drawer with CartPanel */}
      <div
        data-testid="reels-cart-drawer"
        aria-hidden={!isCartOpen}
        inert={!isCartOpen}
        className={`fixed inset-0 z-50 flex flex-col justify-end transition-[opacity,bottom] duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isCartOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        style={{
          bottom: `calc(${chromeOffset}px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        {/* Backdrop */}
        <button
          type="button"
          data-testid="reels-cart-backdrop"
          aria-label="Cerrar carrito"
          onClick={handleCloseCart}
          className={`absolute inset-0 bg-black/70 transition-opacity duration-500 ${
            isCartOpen ? "opacity-100 backdrop-blur-sm" : "opacity-0"
          }`}
        />

        {/* Drawer content */}
        <div
          className={`relative z-10 mx-auto flex h-[85dvh] w-full max-w-md flex-col overflow-hidden p-2 transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform ${
            isCartOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="min-h-0 flex-1">
            {cartContext ? <CartPanel /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
