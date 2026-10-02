"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/features/shop/cart/context/cart.context";
import {
  applyCartDiscount,
  getCart,
  removeCartDiscount,
} from "@/features/shop/cart/services/cart.service";
import DiscountCouponInput from "@/features/shop/cart/components/DiscountCouponInput";
import { createPaymentSession } from "@/features/shop/payments/payment-session.client";
import type {
  CartLine,
  CheckoutFormValues,
  OfficialCart,
  OfficialCartLine,
} from "@/types/types";
import OfficialCartSkeleton from "@/features/shop/checkout/components/skeleton/Skeleton";
import {
  buildCheckoutPayload,
  normalizeOptionalPhone,
} from "@/features/shop/checkout/components/checkout-payload";

const initialFormValues: CheckoutFormValues = {
  customer: {
    name: "",
    phone: "",
  },
  notes: "",
};

function formatCurrency(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function doesGlobalCartMatchOfficialCart(
  items: CartLine[],
  cartId: string | null,
  officialCart: OfficialCart,
) {
  if (cartId !== officialCart.id || items.length !== officialCart.items.length) {
    return false;
  }

  return items.every((item, index) => {
    const officialLine = officialCart.items[index];

    return (
      item.item.documentId === officialLine.documentId &&
      item.quantity === officialLine.quantity &&
      item.item.name === officialLine.name &&
      item.item.price === officialLine.unitPrice &&
      item.item.image === officialLine.image &&
      (item.item.description ?? null) === (officialLine.note ?? null)
    );
  });
}


function OfficialCartSummary({
  officialCart,
  onApplyDiscount,
  onRemoveDiscount,
  disabled = false,
}: {
  officialCart: OfficialCart;
  onApplyDiscount?: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveDiscount?: () => Promise<void>;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold">Tu carrito</h2>
        <p className="text-sm text-white">
          Los totales y disponibilidad son confirmados por el sistema.
        </p>
      </div>

      <div className="space-y-3">
        {officialCart.items.map((line: OfficialCartLine, index: number) => (
          <div
            key={line.documentId ? `${line.documentId}-${index}` : `cart-line-${index}`}
            className="rounded-sm border border-[var(--color-accent-secondary)]/40 p-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">{line.name}</p>
                <p className="text-sm opacity-80">
                  {line.quantity} x{" "}
                  {formatCurrency(line.unitPrice, officialCart.currency)}
                </p>
              </div>
              <p className="font-semibold">
                {formatCurrency(line.lineTotal, officialCart.currency)}
              </p>
            </div>
            {!line.available ? (
              <p className="mt-2 text-sm text-red-700">
                Este producto no esta disponible.
              </p>
            ) : null}
            {line.note ? (
              <p className="mt-2 text-sm opacity-80">{line.note}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-[var(--color-accent-secondary)] pt-4">
        {onApplyDiscount && onRemoveDiscount ? (
          <div className="border-b border-[var(--color-accent-secondary)]/30 pb-3">
            <DiscountCouponInput
              appliedDiscount={officialCart.appliedDiscount}
              discountTotal={officialCart.discountTotal}
              onApply={onApplyDiscount}
              onRemove={onRemoveDiscount}
              disabled={disabled}
            />
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm">
          <span className={officialCart.discountTotal > 0 ? "opacity-75" : ""}>
            Subtotal {officialCart.discountTotal > 0 ? "original" : ""}
          </span>
          <span
            className={
              officialCart.discountTotal > 0
                ? "line-through opacity-60 text-sm"
                : ""
            }
          >
            {formatCurrency(officialCart.subtotal, officialCart.currency)}
          </span>
        </div>

        {officialCart.discountTotal > 0 ? (
          <div className="flex items-center justify-between text-sm font-semibold text-emerald-400">
            <span>
              Descuento{" "}
              {officialCart.appliedDiscount?.code
                ? `(${officialCart.appliedDiscount.code})`
                : ""}
            </span>
            <span>
              -{formatCurrency(officialCart.discountTotal, officialCart.currency)}
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total final</span>
          <span
            className={
              officialCart.discountTotal > 0
                ? "text-xl font-extrabold text-emerald-400"
                : ""
            }
          >
            {formatCurrency(officialCart.total, officialCart.currency)}
          </span>
        </div>
      </div>
    </section>
  );
}

export default function CheckoutPayPage() {
  const router = useRouter();
  const {
    applyOfficialCart,
    cartId,
    isHydrated,
    items,
    snapshot,
    syncCart,
    tenantSlug,
  } = useCart();
  const [formValues, setFormValues] = useState(initialFormValues);
  const [showNotes, setShowNotes] = useState(false);
  const [pendingNotesClear, setPendingNotesClear] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [officialCart, setOfficialCart] = useState<OfficialCart | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [isLoadingCart, setIsLoadingCart] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadOfficialCart = useCallback(
    async (nextCartId?: string | null) => {
      const effectiveCartId = nextCartId ?? cartId;

      if (!effectiveCartId) {
        return null;
      }

      try {
        const backendCart = await getCart(tenantSlug, effectiveCartId);
        setOfficialCart(backendCart);
        return backendCart;
      } catch {
        return null;
      }
    },
    [cartId, tenantSlug],
  );

  const resolveOfficialCart = useCallback(
    async (nextCartId?: string | null) => {
      setIsLoadingCart(true);
      setCartError(null);

      try {
        const backendCart = await loadOfficialCart(nextCartId);

        if (backendCart) {
          return backendCart;
        }

        const syncedCart = await syncCart();

        if (syncedCart) {
          setOfficialCart(syncedCart);
          return syncedCart;
        }

        setOfficialCart(null);
        setCartError("No pudimos validar tu carrito. Intenta nuevamente.");
        return null;
      } finally {
        setIsLoadingCart(false);
      }
    },
    [loadOfficialCart, syncCart],
  );

  useEffect(() => {
    if (!officialCart) {
      return;
    }

    if (doesGlobalCartMatchOfficialCart(items, cartId, officialCart)) {
      return;
    }

    applyOfficialCart(officialCart);
  }, [applyOfficialCart, cartId, items, officialCart]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (snapshot.length === 0) {
      setOfficialCart(null);
      setCartError("Tu carrito esta vacio.");
      return;
    }

    void resolveOfficialCart(cartId);
  }, [cartId, isHydrated, resolveOfficialCart, snapshot.length]);

  const handleRetryValidation = useCallback(async () => {
    await resolveOfficialCart();
  }, [resolveOfficialCart]);

  const handleApplyDiscountInCheckout = useCallback(
    async (code: string) => {
      if (!officialCart?.id) {
        return { success: false, error: "Carrito no validado." };
      }
      try {
        const nextCart = await applyCartDiscount(
          tenantSlug,
          officialCart.id,
          code,
        );
        setOfficialCart(nextCart);
        applyOfficialCart(nextCart);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Error al aplicar cupón.",
        };
      }
    },
    [applyOfficialCart, officialCart?.id, tenantSlug],
  );

  const handleRemoveDiscountInCheckout = useCallback(async () => {
    if (!officialCart?.id) return;
    try {
      const nextCart = await removeCartDiscount(tenantSlug, officialCart.id);
      setOfficialCart(nextCart);
      applyOfficialCart(nextCart);
    } catch (err) {
      console.error("Error al remover cupón:", err);
    }
  }, [applyOfficialCart, officialCart?.id, tenantSlug]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!officialCart?.id) {
      setSubmitError(
        "El pedido necesita un carrito validado antes de poder confirmarse.",
      );
      return;
    }

    const customerName = formValues.customer.name.trim();
    if (!customerName) {
      setSubmitError("Ingresá tu nombre para poder entregarte el pedido.");
      return;
    }

    const customerPhone = normalizeOptionalPhone(formValues.customer.phone);
    const orderNotes = formValues.notes.trim();

    // Synchronous re-entry guard: isSubmitting only disables the button on the
    // next render, so a double tap could otherwise start two payment sessions.
    if (submittingRef.current) return;
    submittingRef.current = true;

    const payload = buildCheckoutPayload({
      cartId: officialCart.id,
      cartVersion: officialCart.version,
      customer: { name: customerName, phone: customerPhone },
      notes: orderNotes,
    });

    setIsSubmitting(true);

    try {
      const session = await createPaymentSession(tenantSlug, payload);
      window.location.assign(session.initPoint);
    } catch (error) {
      submittingRef.current = false;
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo continuar con el pedido.",
      );
      setIsSubmitting(false);
    }
  };

  if (!isHydrated) {
    return (
      <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] p-6 text-[var(--color-accent-secondary)]">
        <div className="mx-auto max-w-3xl rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
          <p>Cargando checkout...</p>
        </div>
      </main>
    );
  }

  if (snapshot.length === 0) {
    return (
      <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] p-6 text-[var(--color-accent-secondary)]">
        <div className="mx-auto max-w-3xl rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
          <h1 className="text-3xl font-bold">Checkout</h1>
          <p className="mt-3">Tu carrito esta vacio.</p>
          <button
            type="button"
            onClick={() => router.push("/order")}
            className="mt-6 rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
          >
            Volver al menu
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] p-6 text-[var(--color-accent-secondary)]">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase">Checkout seguro</p>
            <h1 className="text-3xl font-bold">Revision final del pedido</h1>
            <p className="mt-2 text-sm text-white">
              Revisa los productos y el monto final antes de continuar.
            </p>
            <p className="mt-2 text-sm text-white underline">
              No podras modificarlo luego.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/order")}
            className="rounded-sm border border-[var(--color-accent-secondary)] px-4 py-3 font-semibold"
          >
            Seguir comprando
          </button>
        </div>

        {isLoadingCart ? <OfficialCartSkeleton /> : null}

        {!isLoadingCart && officialCart ? (
          <OfficialCartSummary
            officialCart={officialCart}
            onApplyDiscount={handleApplyDiscountInCheckout}
            onRemoveDiscount={handleRemoveDiscountInCheckout}
            disabled={isSubmitting}
          />
        ) : null}

        {!isLoadingCart && !officialCart && cartError ? (
          <section className="rounded-sm border border-red-700 bg-[var(--color-accent-primary)] p-4 text-red-700">
            <p className="font-semibold">No pudimos validar tu carrito.</p>
            <p className="mt-2 text-sm">{cartError}</p>
            <button
              type="button"
              onClick={handleRetryValidation}
              className="mt-4 rounded-sm border border-current px-4 py-2 font-semibold"
            >
              Reintentar validacion
            </button>
          </section>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6"
        >
          <div>
            <h2 className="text-2xl font-bold">Tus datos</h2>
            <h3 className="text-sm opacity-80">Te llamaremos por este nombre para entregarte el pedido.</h3>
          </div>

          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Nombre *</span>
              <input
                required
                type="text"
                autoComplete="name"
                placeholder="Ej: Juan"
                value={formValues.customer.name}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    customer: {
                      ...current.customer,
                      name: event.target.value,
                    },
                  }))
                }
                className="w-full rounded-sm border border-[var(--color-accent-secondary)] bg-transparent px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-secondary)]"
              />
            </label>

            <label className="block space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Número de celular</span>
                <span className="text-xs opacity-60">Opcional</span>
              </div>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Ej: 11 2345 6789"
                value={formValues.customer.phone ?? ""}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    customer: {
                      ...current.customer,
                      phone: event.target.value,
                    },
                  }))
                }
                className="w-full rounded-sm border border-[var(--color-accent-secondary)]/70 bg-transparent px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-secondary)]"
              />
              <p className="text-xs opacity-70">
                Opcional. Si lo dejás, el local te puede avisar por teléfono cuando tu pedido esté listo.
              </p>
            </label>
          </div>

          <div>
            {!showNotes ? (
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium opacity-85 hover:opacity-100 hover:underline transition-opacity"
              >
                <span>+ Agregar nota o aclaración al pedido</span>
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Notas del pedido (opcional)</span>
                  <button
                    type="button"
                    onClick={() => {
                      const current = formValues.notes.trim();
                      if (current.length > 0) {
                        setPendingNotesClear(current);
                        return;
                      }
                      setShowNotes(false);
                    }}
                    className="text-xs opacity-60 hover:opacity-100 underline"
                  >
                    Quitar nota
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={formValues.notes}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  className="w-full rounded-sm border border-[var(--color-accent-secondary)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-secondary)]"
                  placeholder="Ej: sin cebolla, aderezos aparte..."
                />
                {pendingNotesClear ? (
                  <div className="rounded-sm border border-red-500/50 bg-red-500/10 p-3 text-sm">
                    <p className="font-medium">Vas a descartar esta nota:</p>
                    <p className="mt-1 opacity-90">&laquo;{pendingNotesClear}&raquo;</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotes(false);
                          setFormValues((current) => ({ ...current, notes: "" }));
                          setPendingNotesClear(null);
                        }}
                        className="rounded-sm border border-current px-3 py-1.5 font-semibold"
                      >
                        Quitar de todos modos
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingNotesClear(null)}
                        className="px-3 py-1.5 opacity-75 hover:opacity-100"
                      >
                        Mantener la nota
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {submitError ? (
            <p className="text-sm text-red-500 font-medium">{submitError}</p>
          ) : null}

          <button
            type="submit"
            disabled={!officialCart || isSubmitting || isLoadingCart}
            className="rounded-sm bg-[var(--color-accent-secondary)] px-5 py-3 font-semibold w-full text-center text-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-50 transition-opacity"
          >
            {isSubmitting ? "Procesando pedido..." : "Pagar con Mercado Pago"}
          </button>
          <p className="text-center text-xs opacity-70">
            Después de pagar vas a volver automáticamente a esta pantalla para ver el estado de tu pedido.
          </p>
        </form>
      </div>
    </main>
  );
}
