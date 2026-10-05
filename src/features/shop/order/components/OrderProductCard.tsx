"use client";

import type { MouseEvent } from "react";
import ProductCard from "@/features/shop/menu/classic/components/ProductCard";
import { useOptionalCart } from "@/features/shop/cart/context/cart.context";
import { MenuItem } from "@/types/types";

export interface OrderProductCardProps {
  item: MenuItem;
  interactive?: boolean;
}

export default function OrderProductCard({
  item,
  interactive = true,
}: OrderProductCardProps) {
  const cart = useOptionalCart();

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!interactive) {
      return;
    }

    const target = event.target as HTMLElement | null;

    if (!target?.closest("button")) {
      return;
    }

    cart?.addItem(item);
  }

  return (
    <div onClickCapture={handleClickCapture}>
      <ProductCard item={item} showAddButton={interactive} />
    </div>
  );
}
