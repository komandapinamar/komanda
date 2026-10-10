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
        const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(targetItemId) : targetItemId;
        const el = document.querySelector(`[data-item-id="${safeId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("ring-4", "ring-[var(--color-accent-secondary)]", "transition-all", "duration-500");
          highlightTimer = setTimeout(() => {
            el.classList.remove("ring-4", "ring-[var(--color-accent-secondary)]");
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
    [addItem]
  );

  const handleConfirmModifiers = useCallback(
    (configuredItem: MenuItem) => {
      addItem?.(configuredItem);
      setSelectedItemForModifiers(null);
    },
    [addItem]
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

  return (
    <div
      data-testid="reels-menu-view"
      className="relative w-full h-[100dvh] bg-black text-white overflow-hidden"
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
            className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 min-h-[100dvh]"
          >
            <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-2xl">
              🍽️
            </div>
            <h2 className="text-xl font-bold text-white">Menú en preparación</h2>
            <p className="text-sm text-neutral-400 max-w-xs">
              Pronto podrás ver y pedir todos los platos de nuestra carta aquí.
            </p>
          </div>
        )}
      </ReelFeedContainer>

      {/* Persistent top UI layer: never scrolls away with the feed */}
      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
        <div className="relative w-full h-full md:max-w-md md:h-[92vh] md:overflow-hidden md:rounded-[40px]">
          {/* Scrim gradient top for nav readability */}
          <div
            data-testid="reel-scrim-top"
            className="absolute top-0 left-0 right-0 h-[140px] pointer-events-none z-20"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)",
            }}
          />

          <div className="absolute top-4 left-4 right-4 z-40">
            <MenuViewToolbar mode="reels">
              <ReelsCategoryNav
                categories={categories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={setActiveCategoryId}
              />
            </MenuViewToolbar>
          </div>

          {!orderingAvailable ? (
            <div className="absolute top-20 left-4 right-4 z-30 rounded-md bg-amber-500/90 px-3 py-1.5 text-center text-xs font-bold text-black shadow">
              Pedidos online no disponibles temporalmente.
            </div>
          ) : null}
        </div>
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
          className={`relative z-10 w-full max-w-md mx-auto h-[85dvh] p-2 flex flex-col overflow-hidden transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform ${
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
