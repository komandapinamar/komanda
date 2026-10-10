"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  restoreCartBackup,
  useOptionalCart,
} from "@/features/shop/cart/context/cart.context";

export type PublicOrderStatusData = {
  purchaseNumber: string;
  fulfillmentStatus: string;
  pickupPin?: string | null;
  paymentStatus?: string | null;
  tender?: string | null;
  paymentExpiresAt?: string | null;
};

const labels: Record<string, string> = {
  approved: "Pedido recibido",
  preparing: "Estamos preparando tu pedido",
  ready: "¡Tu pedido está listo para retirar!",
  delivered: "Pedido entregado. ¡Muchas gracias por tu compra!",
  cancelled: "Pedido cancelado",
};

export function formatRemainingTime(
  expiresAt: string | Date | null | undefined,
  now: number = Date.now(),
): {
  formatted: string;
  isExpired: boolean;
  remainingSeconds: number;
} {
  if (!expiresAt) {
    return { formatted: "00:00", isExpired: false, remainingSeconds: 0 };
  }
  const expiryTime = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryTime)) {
    return { formatted: "00:00", isExpired: false, remainingSeconds: 0 };
  }
  const diffMs = expiryTime - now;
  const remainingSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const isExpired = diffMs <= 0;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formatted = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
  return { formatted, isExpired, remainingSeconds };
}

export function PublicOrderStatus({
  tenantId,
  orderId,
  initialOrder,
  initialPin,
}: {
  tenantId: string;
  orderId: string;
  initialOrder?: PublicOrderStatusData | null;
  initialPin?: string | null;
}) {
  const [order, setOrder] = useState<PublicOrderStatusData | null>(
    initialOrder ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [searchPin, setSearchPin] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancellingRef = useRef(false);
  const prevPaymentStatusRef = useRef<string | null>(
    initialOrder?.paymentStatus ?? null,
  );

  const cart = useOptionalCart();

  const handleOpenCancelModal = () => {
    setCancelError(null);
    setShowCancelModal(true);
  };

  const handleCloseCancelModal = () => {
    if (isCancelling) return;
    setShowCancelModal(false);
    setCancelError(null);
  };

  const handleConfirmCancel = async () => {
    if (cancellingRef.current) return;

    if (!/^\d{4}$/.test(displayedPin)) {
      setCancelError(
        "No pudimos recuperar el PIN de tu pedido. Actualizá la página e intentá nuevamente.",
      );
      return;
    }

    cancellingRef.current = true;
    setIsCancelling(true);
    setCancelError(null);

    try {
      const response = await fetch(
        `/api/v1/public/orders/${encodeURIComponent(tenantId)}/${encodeURIComponent(orderId)}/cancel-unpaid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ pickupPin: displayedPin }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 409 && data?.code === "ORDER_ALREADY_PAID") {
          setCancelError(
            "El pedido ya fue cobrado en caja y no puede ser cancelado.",
          );
        } else if (
          response.status === 422 &&
          data?.code === "INVALID_PICKUP_PIN"
        ) {
          setCancelError("El PIN de retiro no coincide.");
        } else {
          setCancelError(
            data?.detail ||
              data?.error?.message ||
              "No se pudo cancelar el pedido. Intenta nuevamente.",
          );
        }
        cancellingRef.current = false;
        setIsCancelling(false);
        return;
      }

      if (cart) {
        cart.restoreCartBackup();
      } else {
        restoreCartBackup();
      }

      setOrder((prev) =>
        prev
          ? { ...prev, fulfillmentStatus: "cancelled" }
          : {
              purchaseNumber: "",
              fulfillmentStatus: "cancelled",
            },
      );
      setShowCancelModal(false);
      cancellingRef.current = false;
      setIsCancelling(false);

      // Full navigation remounts the storefront so the restored cart backup
      // is hydrated from localStorage.
      window.location.assign("/order");
    } catch (err) {
      cancellingRef.current = false;
      setIsCancelling(false);
      setCancelError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al cancelar el pedido.",
      );
    }
  };

  // Resolve the pickup PIN from sessionStorage (preferred, kept out of URLs)
  // with a legacy `?pin=` query fallback, then scrub it from the address bar.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let resolved: string | null = null;
    try {
      resolved = window.sessionStorage.getItem(
        `komanda.cash-pin.${orderId}`,
      );
    } catch {
      resolved = null;
    }

    if (!resolved) {
      const pinFromUrl = new URLSearchParams(window.location.search).get("pin");
      if (pinFromUrl) {
        resolved = pinFromUrl;
        try {
          window.sessionStorage.setItem(
            `komanda.cash-pin.${orderId}`,
            pinFromUrl,
          );
        } catch {
          // ignore storage failures
        }
      }
    }

    if (resolved) {
      setSearchPin(resolved);
    }

    if (window.location.search.includes("pin=")) {
      const cleanUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, [orderId]);

  // Update timer every second when payment is pending
  useEffect(() => {
    if (!order?.paymentExpiresAt || order.paymentStatus !== "pending") return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [order?.paymentExpiresAt, order?.paymentStatus]);

  // Vibrate upon transitioning from pending to paid
  useEffect(() => {
    if (
      order?.paymentStatus === "paid" &&
      prevPaymentStatusRef.current === "pending"
    ) {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {
          // Ignore vibration errors if unsupported
        }
      }
    }
    if (order?.paymentStatus) {
      prevPaymentStatusRef.current = order.paymentStatus;
    }
  }, [order?.paymentStatus]);

  // Polling loop
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/v1/public/orders/${encodeURIComponent(tenantId)}/${encodeURIComponent(orderId)}/status`,
          {
            cache: "no-store",
            headers: {
              "ngrok-skip-browser-warning": "true",
              Accept: "application/json",
            },
          },
        );
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "Pedido no encontrado"
              : "No pudimos consultar tu pedido",
          );
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          // Guard against proxy / tunnel HTML pages without throwing JSON parse error
          return;
        }
        const status = (await response.json()) as PublicOrderStatusData;
        if (!active) return;
        setOrder((prev) => ({
          ...status,
          pickupPin: status.pickupPin ?? prev?.pickupPin ?? null,
        }));
        setError(null);
        if (
          status.fulfillmentStatus === "delivered" ||
          status.fulfillmentStatus === "cancelled"
        ) {
          return;
        }
      } catch (cause) {
        if (!active) return;
        // Keep existing order state visible if background poll fails
        if (!order) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos consultar tu pedido",
          );
        }
      }
      if (active) {
        timer = setTimeout(() => {
          void poll();
        }, 3000);
      }
    };

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tenantId, orderId]);

  const displayedPin = initialPin || searchPin || order?.pickupPin || "";
  const isCancelled = order?.fulfillmentStatus === "cancelled";
  const isCashPending =
    order?.paymentStatus === "pending" &&
    order?.tender === "cash" &&
    !isCancelled;
  const isPaid = order?.paymentStatus === "paid";
  const isReady = order?.fulfillmentStatus === "ready";
  const isPreparing =
    order?.fulfillmentStatus === "preparing" && !isCashPending;
  const isDelivered = order?.fulfillmentStatus === "delivered";

  const { formatted: formattedTimeRemaining, isExpired } = formatRemainingTime(
    order?.paymentExpiresAt,
    now,
  );

  const statusLabel = isCashPending
    ? "Esperando pago en caja"
    : labels[order?.fulfillmentStatus ?? ""] ?? "Estado en actualización";

  return (
    <main className="mx-auto max-w-xl p-6 sm:p-8 text-center text-[var(--color-accent-secondary)]">
      <h1 className="text-4xl font-bold tracking-tight">Komanda</h1>
      <h1 className="text-3xl font-bold tracking-tight">Estado de tu pedido</h1>

      {order ? (
        <div className="mt-6 space-y-5">
          {/* Status highlight banner */}
          <div
            className={`rounded-xl border p-5 text-center ${
              isReady
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                : isPreparing
                  ? "border-amber-500 bg-amber-500/10 text-amber-300"
                  : isDelivered
                    ? "border-zinc-700 bg-zinc-800/40 text-zinc-300"
                    : isCancelled
                      ? "border-red-500 bg-red-500/10 text-red-400"
                      : "border-zinc-700 bg-zinc-800/40 text-zinc-200"
            }`}
            role="status"
          >
            <p className="text-xl font-bold">{statusLabel}</p>
            {isReady ? (
              <p className="mt-1 text-sm text-emerald-300">
                Acercate al mostrador con tu número de compra para retirar.
              </p>
            ) : isPreparing ? (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-amber-200/80">
                <span className="inline-block h-2 w-2 animate-ping rounded-full bg-amber-400" />
                <span>Cocina preparando</span>
              </div>
            ) : null}
          </div>

          {/* Paid transition success banner */}
          {isPaid && !isReady && !isDelivered && !isCancelled && (
            <div className="rounded-xl border border-emerald-500 bg-emerald-500/10 p-5 text-center text-emerald-400">
              <p className="text-lg font-bold">
                ¡Pago acreditado! Tu pedido ya está en preparación
              </p>
            </div>
          )}

          {/* Pending cash payment card with PIN and dynamic countdown */}
          {isCashPending && (
            <div className="rounded-xl border border-amber-500 bg-amber-500/10 p-5 text-center">
              <p className="text-sm font-semibold text-amber-400">
                PIN DE COBRO EN CAJA
              </p>
              <p className="text-4xl font-extrabold tracking-widest my-2">
                {displayedPin}
              </p>
              <p className="text-xs text-amber-200">
                Acercate a la caja para abonar. Tu pedido comenzará a prepararse
                únicamente una vez confirmado el pago.
              </p>
              {isExpired ? (
                <div className="mt-4 rounded-lg bg-red-500/20 border border-red-500/40 p-3">
                  <p className="text-sm font-bold text-red-400">
                    Tiempo de pago expirado
                  </p>
                  <p className="mt-1 text-xs text-zinc-300">
                    El tiempo límite para abonar este pedido en caja ha expirado.
                    Por favor, realizá un nuevo pedido.
                  </p>
                  <Link
                    href="/order"
                    className="mt-3 inline-block rounded-sm bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors"
                  >
                    Volver al menú
                  </Link>
                </div>
              ) : (
                <p className="mt-3 text-sm font-mono">{formattedTimeRemaining}</p>
              )}
              <div className="mt-4 pt-3 border-t border-amber-500/20">
                <button
                  type="button"
                  onClick={handleOpenCancelModal}
                  className="text-xs font-semibold text-zinc-400 hover:text-red-400 underline transition-colors cursor-pointer"
                >
                  Cancelar pedido
                </button>
              </div>
            </div>
          )}

          {/* Purchase number badge */}
          <div className="inline-block rounded-full border border-[var(--color-accent-secondary)]/30 bg-zinc-900/60 px-6 py-2">
            <span className="text-lg font-semibold">
              Compra #{order.purchaseNumber}
            </span>
          </div>

          {/* Pickup PIN card once paid or for non-cash orders */}
          {displayedPin && !isCashPending && (
            <div className="rounded-xl border-2 border-dashed border-[var(--color-accent-secondary)]/40 bg-zinc-900/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Código PIN de Retiro
              </p>
              <p className="mt-1 font-mono text-4xl font-extrabold tracking-widest">
                {displayedPin}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Mostrá este código en el mostrador para retirar tu pedido.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-6 rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!order && !error ? (
        <div className="mt-8 flex flex-col items-center gap-3 text-zinc-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent-secondary)] border-t-transparent" />
          <p className="text-sm">Consultando tu pedido...</p>
        </div>
      ) : null}

      {showCancelModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-left shadow-2xl space-y-4">
            <h2
              id="cancel-modal-title"
              className="text-lg font-bold text-zinc-100"
            >
              ¿Cancelar este pedido?
            </h2>
            <p className="text-sm text-zinc-300">
              Se cancelará tu pedido en efectivo pendiente y se recuperarán los
              productos en tu carrito para que puedas modificarlos.
            </p>
            {cancelError ? (
              <div
                className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400"
                role="alert"
              >
                {cancelError}
              </div>
            ) : null}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleCloseCancelModal}
                className="flex-1 rounded-md border border-zinc-600 bg-transparent py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                No, mantener
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancel}
                className="flex-1 rounded-md bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isCancelling ? "Cancelando..." : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
