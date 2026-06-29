"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/features/shop/cart/context/cart.context";
import { getCart } from "@/features/shop/cart/services/cart.service";
import { createPaymentSession } from "@/features/shop/payments/services/payment-session.service";
import type {
  CartLine,
  CheckoutFormValues,
  OfficialCart,
  OfficialCartLine,
} from "@/types/types";
import OfficialCartSkeleton from "@/features/shop/checkout/components/skeleton/Skeleton";

const initialFormValues: CheckoutFormValues = {
  customer: {
    name: "",
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
}: {
  officialCart: OfficialCart;
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
        {officialCart.items.map((line: OfficialCartLine) => (
          <div
            key={line.documentId}
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
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(officialCart.subtotal, officialCart.currency)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Descuentos</span>
          <span>
            {formatCurrency(officialCart.discountTotal, officialCart.currency)}
          </span>
        </div>
        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total final</span>
          <span>{formatCurrency(officialCart.total, officialCart.currency)}</span>
        </div>
      </div>
    </section>
  );
}

export default function CheckoutPayPage() {
  const router = useRouter();
  const { applyOfficialCart, cartId, isHydrated, items, snapshot, syncCart } = useCart();
  const [formValues, setFormValues] = useState(initialFormValues);
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
        const backendCart = await getCart(effectiveCartId);
        setOfficialCart(backendCart);
        return backendCart;
      } catch {
        return null;
      }
    },
    [cartId],
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!officialCart?.id) {
      setSubmitError(
        "El pedido necesita un carrito validado antes de poder confirmarse.",
      );
      return;
    }

    const payload = {
      cartId: officialCart.id,
      customer: formValues.customer,
      notes: formValues.notes || undefined,
    };

    setIsSubmitting(true);

    try {
      const session = await createPaymentSession(payload);
      window.location.assign(session.initPoint);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo continuar con el pedido.",
      );
    } finally {
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
            <p className="text-sm uppercase tracking-[0.2em]">Checkout seguro</p>
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
          <OfficialCartSummary officialCart={officialCart} />
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
          className="space-y-6 rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6"
        >
          <div>
            <h2 className="text-2xl font-bold">Tus datos</h2>
            <h3 className="text-sm text-white">Te llamaremos por este nombre.</h3>
          </div>

          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="text-sm font-semibold">Nombre</span>
              <input
                required
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
                className="w-full rounded-sm border border-[var(--color-accent-secondary)] bg-transparent px-3 py-2"
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">Notas del pedido</span>
            <textarea
              rows={4}
              value={formValues.notes}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              className="w-full rounded-sm border border-[var(--color-accent-secondary)] bg-transparent px-3 py-2"
              placeholder="Ej: sin cebolla"
            />
          </label>

          {submitError ? (
            <p className="text-sm text-red-700">{submitError}</p>
          ) : null}

          <button
            type="submit"
            disabled={!officialCart || isSubmitting || isLoadingCart}
            className="rounded-sm bg-[var(--color-accent-secondary)] px-5 py-3 font-semibold w-full text-center text-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Procesando pedido..." : "Pagar con Mercado Pago"}
          </button>
          <h1 className="text-xl color-red font-bold text-center">⚠️ Importante: redirigirse a esta pagina luego del pago</h1>
        </form>
      </div>
    </main>
  );
}
