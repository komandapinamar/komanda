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

import {
  applyCartDiscount,
  createCart,
  removeCartDiscount,
} from "@/features/shop/cart/services/cart.service";
import type {
  AppliedDiscountInfo,
  CartLine,
  CartSnapshotLine,
  CartSyncStatus,
  MenuItem,
  OfficialCart,
} from "@/types/types";

type PersistedCartState = {
  cartId: string | null;
  items: CartLine[];
  appliedDiscount?: AppliedDiscountInfo | null;
  discountTotal?: number;
  savedAt?: number;
};

type CartContextValue = {
  tenantSlug: string;
  items: CartLine[];
  // snapshot is a minimal version of "items" to sync with backend before payment
  snapshot: CartSnapshotLine[];
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  total: number;
  appliedDiscount: AppliedDiscountInfo | null;
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
  applyDiscount: (code: string) => Promise<{ success: boolean; error?: string }>;
  removeDiscount: () => Promise<void>;
  backupCart: () => void;
  restoreCartBackup: () => boolean;
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

export function CartProvider({
  children,
  tenantSlug,
}: {
  children: ReactNode;
  tenantSlug: string;
}) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [cartId, setCartId] = useState<string | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscountInfo | null>(null);
  const [discountTotal, setDiscountTotal] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<CartSyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const storageKey = `komanda.cart.${tenantSlug}`;

  useEffect(() => {
    try {
      setItems([]);
      setCartId(null);
      setAppliedDiscount(null);
      setDiscountTotal(0);
      const storedCart = window.localStorage.getItem(storageKey);

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
      if (parsedCart.appliedDiscount) {
        setAppliedDiscount(parsedCart.appliedDiscount);
      }
      if (typeof parsedCart.discountTotal === "number") {
        setDiscountTotal(parsedCart.discountTotal);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setIsHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const persistedState: PersistedCartState = {
      cartId,
      items,
      appliedDiscount,
      discountTotal,
    };

    window.localStorage.setItem(storageKey, JSON.stringify(persistedState));
  }, [appliedDiscount, cartId, discountTotal, isHydrated, items, storageKey]);

  const addItem = useCallback((item: MenuItem) => {
    setCartId(null);
    setSyncStatus("idle");
    setSyncError(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("komanda:cart_add", {
          detail: { itemId: item.documentId },
        }),
      );
    }
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
    setAppliedDiscount(null);
    setDiscountTotal(0);
    setSyncStatus("idle");
    setSyncError(null);
  }, []);

  const snapshot = useMemo(
    () => items.map(cartLineToSnapshot),
    [items],
  );

  const applyOfficialCart = useCallback((cart: OfficialCart) => {
    setItems((currentItems) => officialCartToLines(cart).map((line) => ({
      ...line,
      item: {
        ...line.item,
        videoUrl: currentItems.find(({ item }) => item.documentId === line.item.documentId)?.item.videoUrl,
      },
    })));
    setCartId(cart.id);
    setDiscountTotal(cart.discountTotal ?? 0);
    setAppliedDiscount(cart.appliedDiscount ?? null);
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

  const total = useMemo(
    () => Math.max(0, subtotal - discountTotal),
    [subtotal, discountTotal],
  );

  const syncCart = useCallback(async () => {
    if (items.length === 0) {
      setCartId(null);
      setAppliedDiscount(null);
      setDiscountTotal(0);
      setSyncStatus("idle");
      setSyncError(null);
      return null;
    }

    setSyncStatus("syncing");
    setSyncError(null);

    try {
      const syncedCart = await createCart(
        tenantSlug,
        items.map(cartLineToSnapshot),
        appliedDiscount?.code,
      );
      applyOfficialCart(syncedCart);
      return syncedCart;
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error ? error.message : "No se pudo sincronizar el carrito.",
      );
      return null;
    }
  }, [appliedDiscount?.code, applyOfficialCart, items, tenantSlug]);

  const applyDiscount = useCallback(
    async (code: string) => {
      let activeCartId = cartId;
      if (!activeCartId) {
        const synced = await syncCart();
        activeCartId = synced?.id ?? null;
      }
      if (!activeCartId) {
        return { success: false, error: "No se pudo sincronizar el carrito." };
      }
      try {
        const updatedCart = await applyCartDiscount(
          tenantSlug,
          activeCartId,
          code,
        );
        applyOfficialCart(updatedCart);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Error al aplicar cupón.",
        };
      }
    },
    [applyOfficialCart, cartId, syncCart, tenantSlug],
  );

  const removeDiscount = useCallback(async () => {
    if (cartId) {
      try {
        const updatedCart = await removeCartDiscount(tenantSlug, cartId);
        applyOfficialCart(updatedCart);
      } catch {
        setAppliedDiscount(null);
        setDiscountTotal(0);
      }
    } else {
      setAppliedDiscount(null);
      setDiscountTotal(0);
    }
  }, [applyOfficialCart, cartId, tenantSlug]);

  const backupStorageKey = `komanda.cart.backup.${tenantSlug}`;

  const backupCart = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const persistedState: PersistedCartState = {
        cartId,
        items,
        appliedDiscount,
        discountTotal,
        savedAt: Date.now(),
      };

      window.localStorage.setItem(backupStorageKey, JSON.stringify(persistedState));
    } catch {
      // Ignore localStorage quota / access errors
    }
  }, [appliedDiscount, backupStorageKey, cartId, discountTotal, items]);

  const restoreCartBackupCallback = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      const storedBackup = window.localStorage.getItem(backupStorageKey);
      if (!storedBackup) {
        return false;
      }

      const parsedCart = JSON.parse(storedBackup) as PersistedCartState;

      if (Array.isArray(parsedCart.items)) {
        const restoredItems = parsedCart.items.filter(isPersistedCartLine).map((line) => ({
          ...line,
          item: {
            ...line.item,
            category: line.item.category ?? null,
            combos: line.item.combos ?? null,
          },
        }));

        setItems(restoredItems);
        setCartId(null);
        setAppliedDiscount(parsedCart.appliedDiscount ?? null);
        setDiscountTotal(parsedCart.discountTotal ?? 0);
        setSyncStatus("idle");
        setSyncError(null);

        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            cartId: null,
            items: restoredItems,
            appliedDiscount: parsedCart.appliedDiscount ?? null,
            discountTotal: parsedCart.discountTotal ?? 0,
          }),
        );

        window.localStorage.removeItem(backupStorageKey);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }, [backupStorageKey, storageKey]);

  const beginCheckout = useCallback(async () => syncCart(), [syncCart]);

  const value = useMemo(
    () => ({
      tenantSlug,
      items,
      snapshot,
      itemCount,
      subtotal,
      discountTotal,
      total,
      appliedDiscount,
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
      applyDiscount,
      removeDiscount,
      backupCart,
      restoreCartBackup: restoreCartBackupCallback,
    }),
    [
      addItem,
      applyDiscount,
      applyOfficialCart,
      appliedDiscount,
      backupCart,
      beginCheckout,
      cartId,
      clearCart,
      decrementItem,
      discountTotal,
      isHydrated,
      itemCount,
      items,
      removeDiscount,
      removeItem,
      restoreCartBackupCallback,
      snapshot,
      subtotal,
      syncCart,
      syncError,
      syncStatus,
      tenantSlug,
      total,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useOptionalCart() {
  return useContext(CartContext);
}

export function useCart() {
  const context = useOptionalCart();

  if (!context) {
    throw new Error("useCart must be used inside a CartProvider");
  }

  return context;
}

export function restoreCartBackup(tenantSlug?: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    let targetKey: string | null = null;
    let targetSlug = tenantSlug;

    if (targetSlug) {
      targetKey = `komanda.cart.backup.${targetSlug}`;
    } else {
      // No slug: pick the most recently saved backup to avoid injecting a
      // different tenant's cart into the current storefront.
      let newestSavedAt = -Infinity;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith("komanda.cart.backup.")) {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          let savedAt = 0;
          try {
            const candidate = JSON.parse(raw) as PersistedCartState;
            savedAt =
              typeof candidate.savedAt === "number" ? candidate.savedAt : 0;
          } catch {
            savedAt = 0;
          }
          if (savedAt >= newestSavedAt) {
            newestSavedAt = savedAt;
            targetKey = key;
            targetSlug = key.replace("komanda.cart.backup.", "");
          }
        }
      }
    }

    if (!targetKey || !targetSlug) return false;
    const backupData = window.localStorage.getItem(targetKey);
    if (!backupData) return false;

    const parsedState = JSON.parse(backupData) as PersistedCartState;
    if (!Array.isArray(parsedState.items)) return false;
    parsedState.cartId = null; // Ensure new active cart session is created on checkout

    const primaryKey = `komanda.cart.${targetSlug}`;
    window.localStorage.setItem(primaryKey, JSON.stringify(parsedState));
    window.localStorage.removeItem(targetKey);
    return true;
  } catch {
    return false;
  }
}
