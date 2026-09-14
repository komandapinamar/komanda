"use client";

import { useMemo, useState, useCallback } from "react";
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

export interface ReelsMenuViewProps {
  categories: Category[];
  items: MenuItem[];
  tenantSlug?: string;
}

export default function ReelsMenuView({
  categories,
  items,
  tenantSlug,
}: ReelsMenuViewProps) {
  const cartContext = useOptionalCart();
  const itemCount = cartContext?.itemCount ?? 0;
  const subtotal = cartContext?.subtotal ?? 0;
  const addItem = cartContext?.addItem;

  const [selectedItemForModifiers, setSelectedItemForModifiers] =
    useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

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

  const handleItemLike = useCallback(
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
        {/* Scrim gradient top for nav readability */}
        <div
          data-testid="reel-scrim-top"
          className="absolute top-0 left-0 right-0 h-[140px] pointer-events-none z-20"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)",
          }}
        />

        {/* Floating top category bar */}
        <ReelsCategoryNav
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
        />

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
                onLike={handleItemLike}
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
      {isCartOpen ? (
        <div
          data-testid="reels-cart-drawer"
          className="fixed inset-0 z-50 flex flex-col justify-end"
        >
          {/* Backdrop */}
          <button
            type="button"
            data-testid="reels-cart-backdrop"
            aria-label="Cerrar carrito"
            onClick={handleCloseCart}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Drawer content */}
          <div className="relative z-10 w-full max-w-md mx-auto h-[85vh] rounded-t-2xl bg-[#13151D] border-t border-white/16 p-2 flex flex-col overflow-hidden shadow-2xl">
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1.5 w-14 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 pb-3 pt-2 text-white">
              <h2 className="text-lg font-bold">Tu carrito</h2>
              <button
                type="button"
                data-testid="reels-cart-close-btn"
                onClick={handleCloseCart}
                className="text-sm font-semibold text-neutral-400 hover:text-white"
              >
                Cerrar
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <CartPanel />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
