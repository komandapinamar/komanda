"use client";

import type { MouseEvent } from "react";
import ProductCard from "@/features/shop/menu/components/ProductCard";
import { useCart } from "@/features/shop/cart/context/cart.context";
import { MenuItem } from "@/types/types";

export default function OrderProductCard({ item }: { item: MenuItem }) {
  const { addItem } = useCart();

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;

    if (!target?.closest("button")) {
      return;
    }

    addItem(item);
  }

  return (
    <div onClickCapture={handleClickCapture}>
      <ProductCard item={item} />
    </div>
  );
}
