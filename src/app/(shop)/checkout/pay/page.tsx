"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/features/shop/cart/context/cart.context";
import {
  applyCartDiscount,
  getCart,
  removeCartDiscount,
} from "@/features/shop/cart/services/cart.service";
import DiscountCouponInput from "@/features/shop/cart/components/DiscountCouponInput";
import { createPaymentSession } from "@/features/shop/payments/payment-session.client";
import { createCashOrder } from "@/features/shop/payments/cash-order.client";
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
import { normalizeWhatsAppRecipient } from "@/features/orders/domain/whatsapp-consent";
import {
  formatScheduledForDisplay,
  generateScheduledDaysAndSlots,
  validateScheduledPickupTime,
} from "@/features/orders/domain/order-scheduling";
import {
  normalizeOpeningHours,
  type OpeningHours,
} from "@/features/tenancy/domain/opening-hours";
import { buildPublicDirectoryUrl } from "@/features/tenancy/utils/storefront-url";

const initialFormValues: CheckoutFormValues = {
  customer: {
    name: "",
    phone: "",
    whatsappReadyOptIn: false,
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

export function computeDisplayTotals(
  officialCart: Pick<
    OfficialCart,
    "appliedDiscount" | "discountTotal" | "total" | "subtotal"
  >,
  paymentMethod: "cash" | "mercadopago",
): { discountTotal: number; total: number; suppressedCouponCode: string | null } {
  const coupon = officialCart.appliedDiscount;
  const isSuppressed =
    paymentMethod === "mercadopago" && coupon?.tenderRestriction === "cash";
  return {
    discountTotal: isSuppressed ? 0 : officialCart.discountTotal,
    total: isSuppressed ? officialCart.subtotal : officialCart.total,
    suppressedCouponCode: isSuppressed && coupon ? coupon.code : null,
  };
}

function normalizedOptionIds(optionIds?: string[]) {
  return [...(optionIds ?? [])].sort().join(",");
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
      (officialLine.image ? item.item.image === officialLine.image : true) &&
      normalizedOptionIds(item.item.selectedOptionIds) ===
        normalizedOptionIds(officialLine.optionIds)
    );
  });
}


function OfficialCartSummary({
  officialCart,
  paymentMethod,
  onApplyDiscount,
  onRemoveDiscount,
  disabled = false,
}: {
  officialCart: OfficialCart;
  paymentMethod: "cash" | "mercadopago";
  onApplyDiscount?: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveDiscount?: () => Promise<void>;
  disabled?: boolean;
}) {
  const display = computeDisplayTotals(officialCart, paymentMethod);
  const totalUnits = officialCart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className="liquid-prism-ring liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-5">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
          Resumen del pedido
        </h2>
        <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[#c2c2cc] tabular-nums">
          {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}
        </span>
      </div>

      <div className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/12 bg-[#101013]/90">
        {officialCart.items.map((line: OfficialCartLine, index: number) => (
          <div
            key={line.documentId ? `${line.documentId}-${index}` : `cart-line-${index}`}
            className="p-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#f4f3f1]">{line.name}</p>
                <p className="mt-0.5 text-xs text-[#c2c2cc] tabular-nums">
                  {line.quantity} × {formatCurrency(line.unitPrice, officialCart.currency)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium text-[#f4f3f1] tabular-nums">
                {formatCurrency(line.lineTotal, officialCart.currency)}
              </p>
            </div>
            {!line.available ? (
              <p className="mt-2 text-xs text-red-400">
                Este producto no está disponible.
              </p>
            ) : null}
            {line.selectedOptions && line.selectedOptions.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-white/[0.06] pt-2 text-xs text-[#c2c2cc]">
                {line.selectedOptions.map((option) => (
                  <li key={option.id} className="flex justify-between gap-2 tabular-nums">
                    <span>+ {option.name}</span>
                    {option.priceDelta && option.priceDelta > 0 ? (
                      <span>
                        +{formatCurrency(option.priceDelta, officialCart.currency)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : line.note ? (
              <p className="mt-1.5 text-xs text-[#c2c2cc]">{line.note}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-3.5 pt-1">
        {onApplyDiscount && onRemoveDiscount ? (
          <DiscountCouponInput
            appliedDiscount={officialCart.appliedDiscount}
            discountTotal={officialCart.discountTotal}
            onApply={onApplyDiscount}
            onRemove={onRemoveDiscount}
            disabled={disabled}
          />
        ) : null}

        {display.suppressedCouponCode ? (
          <div
            role="status"
            data-testid="coupon-tender-notice"
            className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200"
          >
            <p>
              El cupón <strong>{display.suppressedCouponCode}</strong> es exclusivo para pagos en efectivo en mostrador.
            </p>
            {onRemoveDiscount ? (
              <button
                type="button"
                onClick={() => void onRemoveDiscount()}
                disabled={disabled}
                className="mt-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-50"
              >
                Quitar cupón
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 border-t border-white/[0.08] pt-4 tabular-nums">
          {display.discountTotal > 0 ? (
            <>
              <div className="flex items-center justify-between text-xs text-[#c2c2cc]">
                <span>Subtotal</span>
                <span className="line-through opacity-60">
                  {formatCurrency(officialCart.subtotal, officialCart.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-medium text-emerald-400">
                <span>
                  Descuento{" "}
                  {officialCart.appliedDiscount?.code
                    ? `(${officialCart.appliedDiscount.code})`
                    : ""}
                </span>
                <span>
                  -{formatCurrency(display.discountTotal, officialCart.currency)}
                </span>
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between text-lg font-medium text-[#f4f3f1]">
            <span>Total</span>
            <span
              className={
                display.discountTotal > 0
                  ? "text-xl font-semibold text-emerald-400"
                  : "text-xl font-semibold text-[#f4f3f1]"
              }
            >
              {formatCurrency(display.total, officialCart.currency)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function CheckoutPayPage() {
  const router = useRouter();
  const {
    applyOfficialCart,
    backupCart,
    cartId,
    clearCart,
    isHydrated,
    items,
    snapshot,
    syncCart,
    tenantSlug,
  } = useCart();
  const [formValues, setFormValues] = useState(initialFormValues);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "cash">("mercadopago");
  const [deliveryTiming, setDeliveryTiming] = useState<"asap" | "scheduled">("asap");
  const [catalogOpeningHours, setCatalogOpeningHours] =
    useState<OpeningHours | null>(null);
  const [catalogTimezone, setCatalogTimezone] = useState<string | undefined>(
    undefined,
  );
  const [showNotes, setShowNotes] = useState(false);
  const [pendingNotesClear, setPendingNotesClear] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [officialCart, setOfficialCart] = useState<OfficialCart | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [isLoadingCart, setIsLoadingCart] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const effectiveOpeningHours =
    officialCart?.openingHours !== undefined
      ? officialCart.openingHours
      : catalogOpeningHours ?? undefined;
  const effectiveTimezone =
    officialCart?.timezone ??
    catalogTimezone ??
    "America/Argentina/Buenos_Aires";

  const scheduledDays = useMemo(
    () =>
      generateScheduledDaysAndSlots({
        openingHours: effectiveOpeningHours,
        timezone: effectiveTimezone,
      }),
    [effectiveOpeningHours, effectiveTimezone],
  );
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [selectedSlotIso, setSelectedSlotIso] = useState<string>("");
  const [directoryUrl, setDirectoryUrl] = useState("/");

  useEffect(() => {
    setDirectoryUrl(buildPublicDirectoryUrl({ tenantSlug }));
  }, [tenantSlug]);

  useEffect(() => {
    if (!tenantSlug) return;
    let active = true;
    void fetch(`/api/v1/storefronts/${encodeURIComponent(tenantSlug)}/catalog`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { openingHours?: unknown; timezone?: string; tenant?: { openingHours?: unknown; timezone?: string } } | null) => {
        if (!active || !data) return;
        const rawHours = data.openingHours ?? data.tenant?.openingHours;
        if (rawHours !== undefined && rawHours !== null) {
          setCatalogOpeningHours(normalizeOpeningHours(rawHours));
        }
        const tz = data.timezone ?? data.tenant?.timezone;
        if (tz) setCatalogTimezone(tz);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [tenantSlug]);

  useEffect(() => {
    if (scheduledDays.length === 0) {
      setSelectedDayKey("");
      setSelectedSlotIso("");
      return;
    }
    const activeDay =
      scheduledDays.find((day) => day.dateKey === selectedDayKey) ??
      scheduledDays[0];
    if (!activeDay) return;
    if (activeDay.dateKey !== selectedDayKey) {
      setSelectedDayKey(activeDay.dateKey);
    }
    const hasSelectedSlot = activeDay.slots.some(
      (slot) => slot.iso === selectedSlotIso,
    );
    if (!hasSelectedSlot) {
      setSelectedSlotIso(activeDay.slots[0]?.iso ?? "");
    }
  }, [scheduledDays, selectedDayKey, selectedSlotIso]);

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

  if (snapshot.length === 0 && !isSubmitting) {
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
    if (formValues.customer.whatsappReadyOptIn && !normalizeWhatsAppRecipient(customerPhone)) {
      setSubmitError("Ingresá un celular argentino válido para recibir avisos por WhatsApp.");
      return;
    }
    const orderNotes = formValues.notes.trim();
    const scheduledForValue =
      deliveryTiming === "scheduled" ? selectedSlotIso.trim() : null;
    if (deliveryTiming === "scheduled") {
      if (!scheduledForValue) {
        setSubmitError("Seleccioná un horario válido dentro del horario de atención del comercio.");
        return;
      }
      try {
        validateScheduledPickupTime(scheduledForValue, {
          openingHours: effectiveOpeningHours,
          timezone: effectiveTimezone,
        });
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : "El horario elegido está fuera del horario de atención del comercio.",
        );
        return;
      }
    }

    // Synchronous re-entry guard: isSubmitting only disables the button on the
    // next render, so a double tap could otherwise start two payment sessions.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setIsSubmitting(true);

    try {
      if (paymentMethod === "cash") {
        const order = await createCashOrder(tenantSlug, {
          cartId: officialCart.id,
          cartVersion: officialCart.version,
          customer: {
            name: customerName,
            phone: customerPhone,
            whatsappReadyOptIn: formValues.customer.whatsappReadyOptIn === true,
          },
          notes: orderNotes || undefined,
          scheduledFor: scheduledForValue,
        });

        const targetTenantId = order.tenantId;
        if (!targetTenantId || !order.orderId) {
          submittingRef.current = false;
          setIsSubmitting(false);
          setSubmitError(
            "No pudimos confirmar el número de pedido. Revisá tu carrito e intentá nuevamente.",
          );
          return;
        }

        // El PIN es la única prueba de identidad del comensal: se guarda en
        // sessionStorage (no en la URL) para no filtrarlo en historial o logs.
        try {
          window.sessionStorage.setItem(
            `komanda.cash-pin.${order.orderId}`,
            order.pickupPin,
          );
        } catch {
          // Ignore storage failures; fallback to queryless status page.
        }

        backupCart();
        clearCart();
        const statusUrl = `/orders/status/${encodeURIComponent(targetTenantId)}/${encodeURIComponent(order.orderId)}`;
        router.push(statusUrl);
      } else {
        const payload = buildCheckoutPayload({
          cartId: officialCart.id,
          cartVersion: officialCart.version,
          customer: { name: customerName, phone: customerPhone, whatsappReadyOptIn: formValues.customer.whatsappReadyOptIn === true },
          notes: orderNotes,
          scheduledFor: scheduledForValue,
        });

        const session = await createPaymentSession(tenantSlug, payload);
        window.location.assign(session.initPoint);
      }
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

  const inputClass =
    "w-full rounded-2xl border border-white/12 bg-[#101013]/90 px-3.5 py-2.5 text-sm text-[#f4f3f1] placeholder:text-[#9b9ba4] outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15";

  if (!isHydrated) {
    return (
      <main className="min-h-[100dvh] bg-[#141416] px-4 py-8 text-[#f4f3f1] sm:px-6">
        <div className="mx-auto max-w-2xl">
          <OfficialCartSkeleton />
        </div>
      </main>
    );
  }

  if (snapshot.length === 0) {
    return (
      <main className="min-h-[100dvh] bg-[#141416] px-4 py-12 text-[#f4f3f1] sm:px-6">
        <div className="liquid-glass-card mx-auto max-w-md rounded-3xl p-8 text-center space-y-4">
          <h1 className="text-2xl font-medium tracking-tight text-[#f4f3f1]">
            Tu carrito está vacío
          </h1>
          <p className="text-xs text-[#c2c2cc]">
            Agregá productos desde el menú para confirmar tu pedido.
          </p>
          <button
            type="button"
            onClick={() => router.push("/order")}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#f4f3f1] px-5 text-xs font-medium text-[#141416] transition hover:bg-white cursor-pointer"
          >
            Volver al menú
          </button>
        </div>
      </main>
    );
  }

  const displayTotals = officialCart
    ? computeDisplayTotals(officialCart, paymentMethod)
    : null;

  return (
    <main className="min-h-[100dvh] bg-[#141416] text-[#f4f3f1] antialiased">
      {/* Full-width top bar at the very top of the screen */}
      <header className="flex w-full items-center justify-between border-b border-white/[0.08] px-5 py-4 sm:px-8">
        <a
          href={directoryUrl}
          className="komanda-logo font-sans text-2xl font-normal tracking-tighter text-white normal-case transition hover:opacity-80"
        >
          <span className="sm:hidden">Kda</span>
          <span className="hidden sm:inline">Komanda</span>
        </a>
        <button
          type="button"
          onClick={() => router.push("/order")}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-4 text-xs font-medium text-[#f4f3f1] transition hover:bg-white/[0.12] cursor-pointer"
        >
          <span aria-hidden="true">←</span>
          <span>Seguir comprando</span>
        </button>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">

        {isLoadingCart ? <OfficialCartSkeleton /> : null}

        {!isLoadingCart && officialCart ? (
          <OfficialCartSummary
            officialCart={officialCart}
            paymentMethod={paymentMethod}
            onApplyDiscount={handleApplyDiscountInCheckout}
            onRemoveDiscount={handleRemoveDiscountInCheckout}
            disabled={isSubmitting}
          />
        ) : null}

        {!isLoadingCart && !officialCart && cartError ? (
          <section className="liquid-glass-card rounded-3xl border-red-400/30 p-6 text-red-200 space-y-3">
            <p className="text-sm font-medium text-red-300">
              No pudimos validar tu carrito.
            </p>
            <p className="text-xs text-[#c2c2cc]">{cartError}</p>
            <button
              type="button"
              onClick={handleRetryValidation}
              className="inline-flex h-9 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 px-4 text-xs font-medium text-red-200 transition hover:bg-red-500/25 cursor-pointer"
            >
              Reintentar validación
            </button>
          </section>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="liquid-glass-card space-y-6 rounded-3xl p-6 sm:p-7"
        >
          {/* 1. Datos de retiro */}
          <div className="space-y-4">
            <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
              Tus datos para retirar
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#c2c2cc]">
                  Nombre *
                </span>
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
                  className={inputClass}
                />
              </label>

              <label className="block space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#c2c2cc]">
                    Celular
                  </span>
                  <span className="text-[11px] text-[#9b9ba4]">Opcional</span>
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
                  className={inputClass}
                />
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-white/10 bg-[#101013]/70 px-3.5 py-2.5 text-xs text-[#d4d4dc]">
              <input
                type="checkbox"
                checked={formValues.customer.whatsappReadyOptIn === true}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    customer: {
                      ...current.customer,
                      whatsappReadyOptIn: event.target.checked,
                    },
                  }))
                }
                className="accent-[#f4f3f1]"
              />
              <span>
                Avisarme por WhatsApp cuando mi pedido esté listo (requiere celular argentino).
              </span>
            </label>

            <div>
              {!showNotes ? (
                <button
                  type="button"
                  onClick={() => setShowNotes(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#c2c2cc] transition hover:text-[#f4f3f1] cursor-pointer"
                >
                  <span>+ Agregar nota o aclaración al pedido</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#c2c2cc]">
                      Notas del pedido
                    </span>
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
                      className="text-xs text-[#9b9ba4] underline underline-offset-4 hover:text-[#f4f3f1] cursor-pointer"
                    >
                      Quitar nota
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={formValues.notes}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="Ej: sin cebolla, aderezos aparte..."
                  />
                  {pendingNotesClear ? (
                    <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3.5 text-xs">
                      <p className="font-medium text-red-200">
                        ¿Descartar la nota «{pendingNotesClear}»?
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowNotes(false);
                            setFormValues((current) => ({
                              ...current,
                              notes: "",
                            }));
                            setPendingNotesClear(null);
                          }}
                          className="rounded-full bg-red-500/20 border border-red-400/40 px-3 py-1 font-medium text-red-200"
                        >
                          Quitar
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingNotesClear(null)}
                          className="px-3 py-1 text-[#c2c2cc] hover:text-white"
                        >
                          Mantener
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* 2. Horario de retiro */}
          <div
            className="space-y-3 border-t border-white/[0.08] pt-5"
            data-testid="checkout-scheduling-section"
          >
            <h3 className="text-sm font-medium text-[#f4f3f1]">
              ¿Cuándo retirás tu pedido?
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                data-testid="schedule-mode-asap"
                onClick={() => setDeliveryTiming("asap")}
                className={`rounded-2xl border p-4 text-left transition cursor-pointer ${
                  deliveryTiming === "asap"
                    ? "border-white/30 bg-white/[0.08] text-[#f4f3f1]"
                    : "border-white/12 bg-[#101013]/80 text-[#c2c2cc] hover:border-white/25 hover:text-[#f4f3f1]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#f4f3f1]">
                    Lo antes posible
                  </span>
                  {deliveryTiming === "asap" && (
                    <span className="text-xs font-medium text-emerald-400">
                      ✓ Ahora
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#c2c2cc]">
                  Preparación inmediata (~15–25 min).
                </p>
              </button>

              <button
                type="button"
                data-testid="schedule-mode-scheduled"
                onClick={() => {
                  setDeliveryTiming("scheduled");
                  if (!selectedDayKey && scheduledDays[0]) {
                    setSelectedDayKey(scheduledDays[0].dateKey);
                    setSelectedSlotIso(scheduledDays[0].slots[0]?.iso ?? "");
                  }
                }}
                className={`rounded-2xl border p-4 text-left transition cursor-pointer ${
                  deliveryTiming === "scheduled"
                    ? "border-white/30 bg-white/[0.08] text-[#f4f3f1]"
                    : "border-white/12 bg-[#101013]/80 text-[#c2c2cc] hover:border-white/25 hover:text-[#f4f3f1]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#f4f3f1]">
                    Programar retiro
                  </span>
                  {deliveryTiming === "scheduled" && (
                    <span className="text-xs font-medium text-emerald-400">
                      ✓ Programado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#c2c2cc]">
                  Elegí el día y la hora dentro del horario del local.
                </p>
              </button>
            </div>

            {deliveryTiming === "scheduled" && scheduledDays.length === 0 ? (
              <div
                data-testid="schedule-no-slots-notice"
                className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-xs text-amber-200"
              >
                Este comercio no tiene rangos horarios disponibles configurados para programar retiros. Elegí &quot;Lo antes posible&quot; para continuar.
              </div>
            ) : null}

            {deliveryTiming === "scheduled" && scheduledDays.length > 0 ? (
              <div
                data-testid="schedule-slot-picker"
                className="space-y-3 rounded-2xl border border-white/12 bg-[#101013]/90 p-4"
              >
                <div className="flex flex-wrap gap-2">
                  {scheduledDays.map((day) => {
                    const isActiveDay = day.dateKey === selectedDayKey;
                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        onClick={() => {
                          setSelectedDayKey(day.dateKey);
                          setSelectedSlotIso(day.slots[0]?.iso ?? "");
                        }}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                          isActiveDay
                            ? "bg-[#f4f3f1] text-[#141416]"
                            : "border border-white/12 bg-white/[0.04] text-[#d4d4dc] hover:bg-white/[0.1]"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const activeDay =
                    scheduledDays.find((d) => d.dateKey === selectedDayKey) ??
                    scheduledDays[0];
                  if (!activeDay) return null;
                  return (
                    <div className="space-y-2">
                      <label className="block text-xs text-[#c2c2cc]">
                        Horario ({activeDay.label})
                        <select
                          data-testid="schedule-slot-select"
                          value={selectedSlotIso}
                          onChange={(e) => setSelectedSlotIso(e.target.value)}
                          className="mt-1.5 h-10 w-full rounded-xl border border-white/15 bg-[#141416] px-3 text-sm font-medium text-[#f4f3f1] tabular-nums focus:border-white/40 focus:outline-none"
                        >
                          {activeDay.slots.map((slot) => (
                            <option key={slot.iso} value={slot.iso}>
                              {activeDay.label} a las {slot.label} hs
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedSlotIso ? (
                        <p className="text-xs font-medium text-emerald-400">
                          Retiro programado: {formatScheduledForDisplay(selectedSlotIso)} hs
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </div>

          {/* 3. Medio de pago */}
          <div className="space-y-3 border-t border-white/[0.08] pt-5">
            <h3 className="text-sm font-medium text-[#f4f3f1]">
              Medio de pago
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("mercadopago")}
                className={`rounded-2xl border p-4 text-left transition cursor-pointer ${
                  paymentMethod === "mercadopago"
                    ? "border-emerald-400/40 bg-emerald-500/12 text-[#f4f3f1]"
                    : "border-white/12 bg-[#101013]/80 text-[#c2c2cc] hover:border-white/25 hover:text-[#f4f3f1]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#f4f3f1]">
                    Mercado Pago
                  </span>
                  {paymentMethod === "mercadopago" && (
                    <span className="text-xs font-medium text-emerald-400">
                      ✓ Seleccionado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#c2c2cc]">
                  Tarjeta, débito o dinero en cuenta.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`rounded-2xl border p-4 text-left transition cursor-pointer ${
                  paymentMethod === "cash"
                    ? "border-amber-400/40 bg-amber-500/12 text-[#f4f3f1]"
                    : "border-white/12 bg-[#101013]/80 text-[#c2c2cc] hover:border-white/25 hover:text-[#f4f3f1]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#f4f3f1]">
                    Efectivo en mostrador
                  </span>
                  {paymentMethod === "cash" && (
                    <span className="text-xs font-medium text-amber-300">
                      ✓ Seleccionado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#c2c2cc]">
                  Abonás en caja al retirar con un código PIN.
                </p>
              </button>
            </div>
          </div>

          {submitError ? (
            <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3.5 text-xs font-medium text-red-300">
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!officialCart || isSubmitting || isLoadingCart}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f4f3f1] px-6 text-sm font-medium text-[#141416] transition hover:bg-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span>
              {isSubmitting
                ? "Procesando pedido..."
                : paymentMethod === "cash"
                  ? "Confirmar pedido en efectivo"
                  : "Pagar con Mercado Pago"}
            </span>
            {!isSubmitting && displayTotals && officialCart ? (
              <span className="tabular-nums opacity-75">
                · {formatCurrency(displayTotals.total, officialCart.currency)}
              </span>
            ) : null}
          </button>
        </form>
      </div>
    </main>
  );
}
