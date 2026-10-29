"use client";

import { useState, type MouseEvent } from "react";
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

export default function OrderProductCard({
  item,
  interactive = true,
}: OrderProductCardProps) {
  const cart = useOptionalCart();
  const [selectedItemForModifiers, setSelectedItemForModifiers] =
    useState<MenuItem | null>(null);

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!interactive) {
      return;
    }

    const target = event.target as HTMLElement | null;

    if (!target?.closest("button")) {
      return;
    }

    dispatchProductCardSelection({
      item,
      interactive,
      cart,
      openModifiers: setSelectedItemForModifiers,
    });
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
      <div onClickCapture={handleClickCapture}>
        <ProductCard item={item} showAddButton={interactive} />
      </div>
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
