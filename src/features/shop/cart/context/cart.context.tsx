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
  removeAddonFromLine?: (lineId: string, optionId: string) => void;
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

function optionSignature(optionIds?: string[]) {
  return [...(optionIds ?? [])].sort().join(",");
}

export function cartLineId(item: MenuItem) {
  const signature = optionSignature(item.selectedOptionIds);
  return signature ? `${item.documentId}::${signature}` : item.documentId;
}

export function getCartLineOptionsDelta(item: MenuItem): number {
  return (item.selectedOptions ?? []).reduce(
    (sum, opt) => sum + (opt.priceDelta ?? 0),
    0,
  );
}

export function getCartLineBaseUnitPrice(item: MenuItem): number {
  if (typeof item.basePrice === "number" && Number.isFinite(item.basePrice)) {
    return item.basePrice;
  }
  const optionsDelta = getCartLineOptionsDelta(item);
  if (optionsDelta > 0 && item.price > optionsDelta) {
    return item.price - optionsDelta;
  }
  return item.price;
}

export function getCartLineSubtotal(cartLine: CartLine): number {
  const baseUnitPrice = getCartLineBaseUnitPrice(cartLine.item);
  const optionsDelta = getCartLineOptionsDelta(cartLine.item);
  return baseUnitPrice * cartLine.quantity + optionsDelta;
}

function cartLinesToSnapshots(cartLines: CartLine[]): CartSnapshotLine[] {
  const snapshots: CartSnapshotLine[] = [];
  for (const cartLine of cartLines) {
    const basePrice = getCartLineBaseUnitPrice(cartLine.item);
    const optionIds = cartLine.item.selectedOptionIds ?? [];
    if (optionIds.length > 0 && cartLine.quantity > 1) {
      // Send 1 unit with the selected add-ons so the backend does not multiply add-ons by quantity,
      // and send the remaining (quantity - 1) units as base items.
      snapshots.push({
        documentId: cartLine.item.documentId,
        quantity: 1,
        name: cartLine.item.name,
        unitPrice: basePrice,
        image: cartLine.item.image,
        optionIds,
        note: cartLine.item.selectedOptionSummary ?? undefined,
      });
      snapshots.push({
        documentId: cartLine.item.documentId,
        quantity: cartLine.quantity - 1,
        name: cartLine.item.name,
        unitPrice: basePrice,
        image: cartLine.item.image,
        optionIds: [],
      });
    } else {
      snapshots.push({
        documentId: cartLine.item.documentId,
        quantity: cartLine.quantity,
        name: cartLine.item.name,
        unitPrice: basePrice,
        image: cartLine.item.image,
        optionIds,
        note: cartLine.item.selectedOptionSummary ?? undefined,
      });
    }
  }
  return snapshots;
}

function officialCartToLines(cart: OfficialCart): CartLine[] {
  return cart.items.map((line) => {
    const optionsDelta = (line.selectedOptions ?? []).reduce(
      (sum, opt) => sum + (opt.priceDelta ?? 0),
      0,
    );
    const basePrice =
      optionsDelta > 0 && line.unitPrice > optionsDelta
        ? line.unitPrice - optionsDelta
        : line.unitPrice;

    return {
      lineId:
        line.id ??
        cartLineId({
          documentId: line.documentId,
          name: line.name,
          price: line.unitPrice,
          basePrice,
          description: null,
          image: line.image,
          category: null,
          combos: null,
          selectedOptionIds: line.optionIds,
        }),
      quantity: line.quantity,
      item: {
        documentId: line.documentId,
        name: line.name,
        price: line.unitPrice,
        basePrice,
        description: line.note ?? null,
        image: line.image,
        category: null,
        combos: null,
        selectedOptionIds: line.optionIds,
        selectedOptionSummary:
          line.optionNames?.join(", ") || line.note || null,
        selectedOptions: line.selectedOptions,
      },
    };
  });
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
  const [appliedDiscount, setAppliedDiscount] =
    useState<AppliedDiscountInfo | null>(null);
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
            lineId: line.lineId ?? cartLineId(line.item),
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
      const targetLineId = cartLineId(item);
      const existingItem = currentItems.find(
        (cartLine) =>
          (cartLine.lineId ?? cartLineId(cartLine.item)) === targetLineId,
      );

      if (!existingItem) {
        return [...currentItems, { item, quantity: 1, lineId: targetLineId }];
      }

      return currentItems.map((cartLine) =>
        (cartLine.lineId ?? cartLineId(cartLine.item)) === targetLineId
          ? { ...cartLine, quantity: cartLine.quantity + 1 }
          : cartLine,
      );
    });
  }, []);

  const decrementItem = useCallback((lineIdOrDocumentId: string) => {
    setCartId(null);
    setSyncStatus("idle");
    setSyncError(null);
    setItems((currentItems) => {
      const hasExactLineMatch = currentItems.some(
        (cartLine) =>
          (cartLine.lineId ?? cartLineId(cartLine.item)) === lineIdOrDocumentId,
      );

      const targetIndex = currentItems.findIndex((cartLine) => {
        const lineId = cartLine.lineId ?? cartLineId(cartLine.item);
        return hasExactLineMatch
          ? lineId === lineIdOrDocumentId
          : cartLine.item.documentId === lineIdOrDocumentId;
      });

      if (targetIndex < 0) return currentItems;

      const targetLine = currentItems[targetIndex]!;
      const hasAddons = (targetLine.item.selectedOptionIds ?? []).length > 0;

      // If decrementing a line of quantity 1 that has add-ons, and another plain line
      // of the same product exists in the cart, transfer the add-ons to the remaining unit
      // so the add-on is never lost when reducing the product count.
      if (targetLine.quantity === 1 && hasAddons) {
        const siblingIndex = currentItems.findIndex(
          (other, idx) =>
            idx !== targetIndex &&
            other.item.documentId === targetLine.item.documentId &&
            (other.item.selectedOptionIds ?? []).length === 0,
        );
        if (siblingIndex >= 0) {
          const sibling = currentItems[siblingIndex]!;
          const mergedItem: MenuItem = {
            ...sibling.item,
            price: targetLine.item.price,
            basePrice: getCartLineBaseUnitPrice(targetLine.item),
            selectedOptionIds: targetLine.item.selectedOptionIds,
            selectedOptionSummary: targetLine.item.selectedOptionSummary,
            selectedOptions: targetLine.item.selectedOptions,
          };
          const newLineId = cartLineId(mergedItem);
          return currentItems
            .map((line, idx) =>
              idx === siblingIndex
                ? { ...line, lineId: newLineId, item: mergedItem }
                : line,
            )
            .filter((_, idx) => idx !== targetIndex);
        }
      }

      return currentItems.flatMap((cartLine, idx) => {
        if (idx !== targetIndex) {
          return [cartLine];
        }

        if (cartLine.quantity <= 1) {
          return [];
        }

        return [{ ...cartLine, quantity: cartLine.quantity - 1 }];
      });
    });
  }, []);

  const removeItem = useCallback((lineIdOrDocumentId: string) => {
    setCartId(null);
    setSyncStatus("idle");
    setSyncError(null);
    setItems((currentItems) => {
      const hasExactLineMatch = currentItems.some(
        (cartLine) =>
          (cartLine.lineId ?? cartLineId(cartLine.item)) === lineIdOrDocumentId,
      );

      const targetIndex = currentItems.findIndex((cartLine) => {
        const lineId = cartLine.lineId ?? cartLineId(cartLine.item);
        return hasExactLineMatch
          ? lineId === lineIdOrDocumentId
          : cartLine.item.documentId === lineIdOrDocumentId;
      });

      if (targetIndex < 0) return currentItems;

      const targetLine = currentItems[targetIndex]!;
      const hasAddons = (targetLine.item.selectedOptionIds ?? []).length > 0;

      if (hasAddons) {
        const siblingIndex = currentItems.findIndex(
          (other, idx) =>
            idx !== targetIndex &&
            other.item.documentId === targetLine.item.documentId &&
            (other.item.selectedOptionIds ?? []).length === 0,
        );
        if (siblingIndex >= 0) {
          const sibling = currentItems[siblingIndex]!;
          const mergedItem: MenuItem = {
            ...sibling.item,
            price: targetLine.item.price,
            basePrice: getCartLineBaseUnitPrice(targetLine.item),
            selectedOptionIds: targetLine.item.selectedOptionIds,
            selectedOptionSummary: targetLine.item.selectedOptionSummary,
            selectedOptions: targetLine.item.selectedOptions,
          };
          const newLineId = cartLineId(mergedItem);
          return currentItems
            .map((line, idx) =>
              idx === siblingIndex
                ? { ...line, lineId: newLineId, item: mergedItem }
                : line,
            )
            .filter((_, idx) => idx !== targetIndex);
        }
      }

      return currentItems.filter((_, idx) => idx !== targetIndex);
    });
  }, []);

  const removeAddonFromLine = useCallback(
    (targetLineId: string, optionId: string) => {
      setCartId(null);
      setSyncStatus("idle");
      setSyncError(null);
      setItems((currentItems) =>
        currentItems.map((cartLine) => {
          const lineId = cartLine.lineId ?? cartLineId(cartLine.item);
          if (lineId !== targetLineId) return cartLine;

          const nextOptions = (cartLine.item.selectedOptions ?? []).filter(
            (opt) => opt.id !== optionId,
          );
          const nextOptionIds = (cartLine.item.selectedOptionIds ?? []).filter(
            (id) => id !== optionId,
          );
          const basePrice = getCartLineBaseUnitPrice(cartLine.item);
          const nextDelta = nextOptions.reduce(
            (sum, opt) => sum + (opt.priceDelta ?? 0),
            0,
          );
          const nextSummary =
            nextOptions.map((opt) => opt.name).join(", ") || null;

          const updatedItem: MenuItem = {
            ...cartLine.item,
            price: basePrice + nextDelta,
            basePrice,
            selectedOptions: nextOptions,
            selectedOptionIds: nextOptionIds,
            selectedOptionSummary: nextSummary,
          };

          return {
            ...cartLine,
            lineId: cartLineId(updatedItem),
            item: updatedItem,
          };
        }),
      );
    },
    [],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    setCartId(null);
    setAppliedDiscount(null);
    setDiscountTotal(0);
    setSyncStatus("idle");
    setSyncError(null);
  }, []);

  const snapshot = useMemo(() => cartLinesToSnapshots(items), [items]);

  const applyOfficialCart = useCallback((cart: OfficialCart) => {
    setItems((currentItems) =>
      officialCartToLines(cart).map((line) => ({
        ...line,
        item: {
          ...line.item,
          videoUrl: currentItems.find(
            ({ item }) => item.documentId === line.item.documentId,
          )?.item.videoUrl,
        },
      })),
    );
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
        (totalPrice, cartLine) => totalPrice + getCartLineSubtotal(cartLine),
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
        cartLinesToSnapshots(items),
        appliedDiscount?.code,
      );
      applyOfficialCart(syncedCart);
      return syncedCart;
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error
          ? error.message
          : "No se pudo sincronizar el carrito.",
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
    if (!cartId) {
      setAppliedDiscount(null);
      setDiscountTotal(0);
      return;
    }
    try {
      const updatedCart = await removeCartDiscount(tenantSlug, cartId);
      applyOfficialCart(updatedCart);
    } catch {
      setAppliedDiscount(null);
      setDiscountTotal(0);
    }
  }, [applyOfficialCart, cartId, tenantSlug]);

  const beginCheckout = useCallback(async () => {
    return syncCart();
  }, [syncCart]);

  const backupKey = `komanda.cart.backup.${tenantSlug}`;

  const backupCart = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const payload: PersistedCartState = {
        cartId,
        items,
        appliedDiscount,
        discountTotal,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(backupKey, JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
  }, [appliedDiscount, backupKey, cartId, discountTotal, items]);

  const restoreCartBackup = useCallback((): boolean => {
    return restoreCartBackupForTenant(tenantSlug, (restored) => {
      setItems(restored.items);
      setCartId(restored.cartId);
      setAppliedDiscount(restored.appliedDiscount ?? null);
      setDiscountTotal(restored.discountTotal ?? 0);
      setSyncStatus("idle");
      setSyncError(null);
    });
  }, [tenantSlug]);

  const value = useMemo<CartContextValue>(
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
      removeAddonFromLine,
      clearCart,
      syncCart,
      beginCheckout,
      applyOfficialCart,
      applyDiscount,
      removeDiscount,
      backupCart,
      restoreCartBackup,
    }),
    [
      addItem,
      appliedDiscount,
      applyDiscount,
      applyOfficialCart,
      backupCart,
      beginCheckout,
      cartId,
      clearCart,
      decrementItem,
      discountTotal,
      isHydrated,
      itemCount,
      items,
      removeAddonFromLine,
      removeDiscount,
      removeItem,
      restoreCartBackup,
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

const BACKUP_TTL_MS = 60 * 60 * 1000;

export function restoreCartBackup(
  tenantSlug?: string,
  onRestored?: (state: PersistedCartState) => void,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    let key = tenantSlug ? `komanda.cart.backup.${tenantSlug}` : null;
    if (!key) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("komanda.cart.backup.")) {
          key = k;
          break;
        }
      }
    }
    if (!key) return false;

    const raw = window.localStorage.getItem(key);
    if (!raw) return false;

    const parsed = JSON.parse(raw) as PersistedCartState;
    if (
      parsed.savedAt &&
      Date.now() - parsed.savedAt > BACKUP_TTL_MS
    ) {
      window.localStorage.removeItem(key);
      return false;
    }

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return false;
    }

    const resolvedSlug = key.replace("komanda.cart.backup.", "");
    const activeStorageKey = `komanda.cart.${resolvedSlug}`;
    const restoredState: PersistedCartState = {
      cartId: null,
      items: parsed.items,
      appliedDiscount: parsed.appliedDiscount ?? null,
      discountTotal: parsed.discountTotal ?? 0,
    };
    window.localStorage.setItem(
      activeStorageKey,
      JSON.stringify(restoredState),
    );
    window.localStorage.removeItem(key);
    onRestored?.(restoredState);
    return true;
  } catch {
    return false;
  }
}

const restoreCartBackupForTenant = restoreCartBackup;

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider.");
  }
  return context;
}

export function useOptionalCart() {
  return useContext(CartContext);
}
