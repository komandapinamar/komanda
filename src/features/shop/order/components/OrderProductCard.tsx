"use client";

import { useState, useEffect, useCallback, type MouseEvent } from "react";
import Image from "next/image";
import ProductCard from "@/features/shop/menu/classic/components/ProductCard";
import ProductModifierSheet from "@/features/shop/menu/reels/components/ProductModifierSheet";
import { useOptionalCart } from "@/features/shop/cart/context/cart.context";
import { MenuItem } from "@/types/types";

export interface OrderProductCardProps {
  item: MenuItem;
  interactive?: boolean;
}

type AddToCart = { addItem: (item: MenuItem) => void } | null | undefined;

export function dispatchProductCardSelection(input: {
  item: MenuItem;
  interactive: boolean;
  cart: AddToCart;
  openModifiers: (item: MenuItem) => void;
}) {
  if (!input.interactive) {
    return;
  }

  if (input.item.hasOptions) {
    input.openModifiers(input.item);
    return;
  }

  input.cart?.addItem(input.item);
}

function ProductDetailModal({
  item,
  interactive,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  interactive: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  const [isEntered, setIsEntered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsEntered(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const triggerClose = useCallback(() => {
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 220);
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        triggerClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [triggerClose]);

  const showActive = isEntered && !isClosing;

  return (
    <div
      data-testid="product-detail-modal-overlay"
      onClick={triggerClose}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        showActive
          ? "bg-black/80 backdrop-blur-xl opacity-100"
          : "bg-black/0 backdrop-blur-none opacity-0"
      }`}
    >
      <div
        data-testid="product-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className={`liquid-prism-ring liquid-glass-card relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-[#16161a]/95 text-[#f4f3f1] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          showActive
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-5 scale-[0.94] opacity-0"
        }`}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={triggerClose}
          aria-label="Cerrar detalle"
          className="absolute top-3.5 right-3.5 z-20 flex size-9 items-center justify-center rounded-full border border-white/15 bg-[#141416]/80 text-xs text-[#f4f3f1] backdrop-blur-md transition hover:bg-black active:scale-95 cursor-pointer"
        >
          ✕
        </button>

        {/* Large Expanded Photo / Video Stage */}
        {item.image ? (
          <div className="relative flex max-h-[54dvh] min-h-64 w-full items-center justify-center overflow-hidden bg-[#101013]">
            <Image
              src={item.image}
              alt=""
              aria-hidden="true"
              fill
              unoptimized
              className="pointer-events-none scale-110 object-cover opacity-35 blur-2xl"
            />
            <Image
              src={item.image}
              alt={item.name}
              width={720}
              height={540}
              unoptimized
              className="relative z-10 max-h-[54dvh] w-full object-contain"
            />
          </div>
        ) : null}

        {/* Product Details & Action */}
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-medium tracking-tight text-[#f4f3f1]">
                {item.name}
              </h2>
              <span className="shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1 text-base font-semibold tabular-nums text-[#f4f3f1]">
                ${item.price.toLocaleString("es-AR")}
              </span>
            </div>

            {item.description ? (
              <p className="text-sm leading-relaxed text-[#d4d4dc]">
                {item.description}
              </p>
            ) : null}
          </div>

          {interactive ? (
            <button
              type="button"
              onClick={() => {
                setIsClosing(true);
                window.setTimeout(() => {
                  onClose();
                  onAdd();
                }, 180);
              }}
              className="inline-flex h-11 w-full items-center justify-between rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] transition duration-200 hover:bg-white active:scale-[0.98] cursor-pointer"
            >
              <span>
                {item.hasOptions
                  ? "Elegir adicionales y sumar"
                  : "Agregar a mi pedido"}
              </span>
              <span className="rounded-full bg-[#141416]/12 px-3 py-0.5 text-xs font-semibold tabular-nums">
                ${item.price.toLocaleString("es-AR")}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OrderProductCard({
  item,
  interactive = true,
}: OrderProductCardProps) {
  const cart = useOptionalCart();
  const [selectedItemForModifiers, setSelectedItemForModifiers] =
    useState<MenuItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;

    if (target?.closest("button")) {
      if (!interactive) {
        return;
      }
      event.stopPropagation();
      dispatchProductCardSelection({
        item,
        interactive,
        cart,
        openModifiers: setSelectedItemForModifiers,
      });
      return;
    }

    setIsDetailModalOpen(true);
  }

  function handleConfirmModifiers(configuredItem: MenuItem) {
    cart?.addItem(configuredItem);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setSelectedItemForModifiers(null);
      }, 240);
    } else {
      setSelectedItemForModifiers(null);
    }
  }

  return (
    <>
      <div onClickCapture={handleClickCapture} className="cursor-pointer">
        <ProductCard item={item} showAddButton={interactive} />
      </div>

      {isDetailModalOpen ? (
        <ProductDetailModal
          item={item}
          interactive={interactive}
          onClose={() => setIsDetailModalOpen(false)}
          onAdd={() =>
            dispatchProductCardSelection({
              item,
              interactive,
              cart,
              openModifiers: setSelectedItemForModifiers,
            })
          }
        />
      ) : null}

      {selectedItemForModifiers ? (
        <ProductModifierSheet
          key={selectedItemForModifiers.documentId}
          item={selectedItemForModifiers}
          isOpen={true}
          onConfirm={handleConfirmModifiers}
          onClose={() => setSelectedItemForModifiers(null)}
        />
      ) : null}
    </>
  );
}
