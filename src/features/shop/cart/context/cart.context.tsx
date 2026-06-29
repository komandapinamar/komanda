"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createCart } from "@/features/shop/cart/services/cart.service";
import type {
  CartLine,
  CartSnapshotLine,
  CartSyncStatus,
  MenuItem,
  OfficialCart,
} from "@/types/types";

const CART_STORAGE_KEY = "chikenstop.cart";

type PersistedCartState = {
  cartId: string | null;
  items: CartLine[];
};

type CartContextValue = {
  items: CartLine[];
  // snapshot is a minimal version of "items" to sync with backend before payment
  snapshot: CartSnapshotLine[];
  itemCount: number;
  subtotal: number;
  cartId: string | null;
  syncStatus: CartSyncStatus;
  syncError: string | null;
  isHydrated: boolean;
  addItem: (item: MenuItem) => void;
  decrementItem: (documentId: string) => void;
  removeItem: (documentId: string) => void;
  clearCart: () => void;
  syncCart: () => Promise<OfficialCart | null>;
  beginCheckout: () => Promise<OfficialCart | null>;
  applyOfficialCart: (cart: OfficialCart) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function cartLineToSnapshot(cartLine: CartLine): CartSnapshotLine {
  return {
    documentId: cartLine.item.documentId,
    quantity: cartLine.quantity,
    name: cartLine.item.name,
    unitPrice: cartLine.item.price,
    image: cartLine.item.image,
  };
}

function officialCartToLines(cart: OfficialCart): CartLine[] {
  return cart.items.map((line) => ({
    quantity: line.quantity,
    item: {
      documentId: line.documentId,
      name: line.name,
      price: line.unitPrice,
      description: line.note ?? null,
      image: line.image,
      category: null,
      combos: null,
    },
  }));
}

function isPersistedCartLine(line: unknown): line is CartLine {
  const cartLine = line as CartLine | undefined;

  return (
    Boolean(cartLine) &&
    typeof cartLine?.quantity === "number" &&
    typeof cartLine?.item?.documentId === "string" &&
    cartLine.item.documentId.length > 0
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [cartId, setCartId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CartSyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);

      if (!storedCart) {
        setIsHydrated(true);
        return;
      }

      const parsedCart = JSON.parse(storedCart) as PersistedCartState;

      if (Array.isArray(parsedCart.items)) {
        setItems(
          parsedCart.items.filter(isPersistedCartLine).map((line) => ({
            ...line,
            item: {
              ...line.item,
              category: line.item.category ?? null,
              combos: line.item.combos ?? null,
            },
          })),
        );
      }

      setCartId(parsedCart.cartId ?? null);
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const persistedState: PersistedCartState = {
      cartId,
      items,
    };

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(persistedState));
  }, [cartId, isHydrated, items]);

  const addItem = useCallback((item: MenuItem) => {
    setCartId(null);
    setSyncStatus("idle");
    setSyncError(null);
    setItems((currentItems) => {
      const existingItem = currentItems.find(
        (cartLine) => cartLine.item.documentId === item.documentId,
      );

      if (!existingItem) {
        return [...currentItems, { item, quantity: 1 }];
      }

      return currentItems.map((cartLine) =>
        cartLine.item.documentId === item.documentId
          ? { ...cartLine, quantity: cartLine.quantity + 1 }
          : cartLine,
      );
    });
  }, []);

  const decrementItem = useCallback((documentId: string) => {
    setCartId(null);
    setSyncStatus("idle");
    setSyncError(null);
    setItems((currentItems) =>
      currentItems.flatMap((cartLine) => {
        if (cartLine.item.documentId !== documentId) {
          return [cartLine];
        }

        if (cartLine.quantity === 1) {
          return [];
        }

        return [{ ...cartLine, quantity: cartLine.quantity - 1 }];
      }),
    );
  }, []);

  const removeItem = useCallback((documentId: string) => {
    setCartId(null);
    setSyncStatus("idle");
    setSyncError(null);
    setItems((currentItems) =>
      currentItems.filter((cartLine) => cartLine.item.documentId !== documentId),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setCartId(null);
    setSyncStatus("idle");
    setSyncError(null);
  }, []);

  const snapshot = useMemo(
    () => items.map(cartLineToSnapshot),
    [items],
  );

  const applyOfficialCart = useCallback((cart: OfficialCart) => {
    setItems(officialCartToLines(cart));
    setCartId(cart.id);
    setSyncStatus("ready");
    setSyncError(null);
  }, []);

  const itemCount = useMemo(
    () =>
      items.reduce(
        (totalItems, cartLine) => totalItems + cartLine.quantity,
        0,
      ),
    [items],
  );

  const subtotal = useMemo(
    () =>
      items.reduce(
        (totalPrice, cartLine) =>
          totalPrice + cartLine.quantity * cartLine.item.price,
        0,
      ),
    [items],
  );

  const syncCart = useCallback(async () => {
    if (items.length === 0) {
      setCartId(null);
      setSyncStatus("idle");
      setSyncError(null);
      return null;
    }

    setSyncStatus("syncing");
    setSyncError(null);

    try {
      const syncedCart = await createCart(items.map(cartLineToSnapshot));
      applyOfficialCart(syncedCart);
      return syncedCart;
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error ? error.message : "No se pudo sincronizar el carrito.",
      );
      return null;
    }
  }, [applyOfficialCart, items]);

  const beginCheckout = useCallback(async () => syncCart(), [syncCart]);

  const value = useMemo(
    () => ({
      items,
      snapshot,
      itemCount,
      subtotal,
      cartId,
      syncStatus,
      syncError,
      isHydrated,
      addItem,
      decrementItem,
      removeItem,
      clearCart,
      syncCart,
      beginCheckout,
      applyOfficialCart,
    }),
    [
      addItem,
      applyOfficialCart,
      beginCheckout,
      cartId,
      clearCart,
      decrementItem,
      isHydrated,
      itemCount,
      items,
      removeItem,
      snapshot,
      subtotal,
      syncCart,
      syncError,
      syncStatus,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside a CartProvider");
  }

  return context;
}
