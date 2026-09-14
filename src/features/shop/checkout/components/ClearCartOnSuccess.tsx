"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/features/shop/cart/context/cart.context";

export default function ClearCartOnSuccess() {
  const { clearCart, isHydrated } = useCart();
  const hasClearedRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || hasClearedRef.current) {
      return;
    }

    clearCart();
    hasClearedRef.current = true;
  }, [clearCart, isHydrated]);

  return null;
}
