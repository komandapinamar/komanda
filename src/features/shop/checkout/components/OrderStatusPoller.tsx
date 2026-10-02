"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import ClearCartOnSuccess from "./ClearCartOnSuccess";
import { orderTrackingPath, orderTrackingUrl } from "./order-tracking";

type OrderData = {
  orderId: string;
  tenantId?: string | null;
  purchaseNumber: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  pickupPin?: string | null;
  estimatedWaitMinutes?: number | null;
  estimatedReadyAt?: string | null;
  hasCustomerPhone?: boolean;
};

export function OrderStatusPoller({
  paymentId,
  trackingBaseUrl,
}: {
  paymentId: string;
  trackingBaseUrl: string;
}) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [status, setStatus] = useState<"polling" | "completed" | "timeout" | "error">("polling");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let attempts = 0;
    let consecutiveFailures = 0;
    const maxAttempts = 100;
    const maxConsecutiveFailures = 5;

    const stop = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const poll = async () => {
      if (!mountedRef.current) return;
      attempts++;
      try {
        const response = await fetch(`/api/v1/payments/${encodeURIComponent(paymentId)}/order-status`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Failed to lookup payment.");
        const data = await response.json() as {
          status: string;
          orderId: string | null;
          tenantId?: string | null;
          purchaseNumber: string | null;
          fulfillmentStatus: string | null;
          paymentStatus: string | null;
          pickupPin?: string | null;
          estimatedWaitMinutes?: number | null;
          estimatedReadyAt?: string | null;
          hasCustomerPhone?: boolean;
        };
        if (!mountedRef.current) return;
        consecutiveFailures = 0;

        if (data.status === "not_found") {
          setStatus("error");
          stop();
          return;
        }

        if (data.status === "completed" && data.orderId) {
          setOrder((prev) => {
            if (data.fulfillmentStatus === "ready" && prev?.fulfillmentStatus !== "ready") {
              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try {
                  navigator.vibrate([200, 100, 200]);
                } catch {
                  // Ignore vibration errors if unsupported
                }
              }
            }
            return {
              orderId: data.orderId!,
              tenantId: data.tenantId ?? null,
              purchaseNumber: data.purchaseNumber ?? "",
              fulfillmentStatus: data.fulfillmentStatus ?? "",
              paymentStatus: data.paymentStatus ?? "",
              pickupPin: data.pickupPin ?? null,
              estimatedWaitMinutes: data.estimatedWaitMinutes ?? null,
              estimatedReadyAt: data.estimatedReadyAt ?? null,
              hasCustomerPhone: Boolean(data.hasCustomerPhone),
            };
          });
          setStatus("completed");
          if (data.fulfillmentStatus === "delivered" || data.fulfillmentStatus === "cancelled") {
            stop();
          }
        } else if (attempts >= maxAttempts) {
          setStatus("timeout");
          stop();
        }
      } catch {
        if (!mountedRef.current) return;
        consecutiveFailures++;
        if (consecutiveFailures >= maxConsecutiveFailures) {
          setStatus("error");
          stop();
        } else if (attempts >= maxAttempts) {
          setStatus("timeout");
          stop();
        }
      }
    };

    void poll();
    intervalRef.current = setInterval(poll, 3000);

    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [paymentId]);

  // A new paymentId remounts this component (see the `key` on the caller), so
  // the previous order's PIN and QR can never linger here.

  useEffect(() => {
    if (!order?.tenantId || !order?.orderId) {
      // Nothing to render: the QR block is guarded by the same condition.
      return;
    }

    let cancelled = false;
    const trackingUrl = orderTrackingUrl(trackingBaseUrl, order.tenantId, order.orderId);

    QRCode.toDataURL(trackingUrl, {
      margin: 1,
      width: 200,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then((dataUri) => {
        if (!cancelled) setQrDataUrl(dataUri);
      })
      .catch(() => {
        // Leave qrDataUrl null: the plain tracking link renders instead.
      });

    return () => {
      cancelled = true;
    };
  }, [order?.tenantId, order?.orderId, trackingBaseUrl]);

  if (status === "polling") {
    return (
      <div className="mx-auto max-w-3xl rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
        <h1 className="text-3xl font-bold">Pago recibido</h1>
        <p className="mt-3">Estamos confirmando tu pedido.</p>
        <div className="mt-4 flex items-center gap-3 text-sm opacity-80">
          <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-accent-secondary)] border-t-transparent" />
          <span>Confirmando pago...</span>
        </div>
      </div>
    );
  }

  if (status === "timeout") {
    return (
      <div className="mx-auto max-w-3xl rounded-sm border border-amber-700 bg-[var(--color-accent-primary)] p-6">
        <h1 className="text-3xl font-bold text-amber-500">Pago recibido</h1>
        <p className="mt-3">El pago fue recibido pero estamos demorando en confirmarlo.</p>
        <p className="mt-2 text-sm opacity-80">
          Si ya te cobraron, no te preocupes, tu pedido se va a procesar en unos minutos.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/order"
            className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
          >
            Volver al menu
          </Link>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-3xl rounded-sm border border-red-700 bg-[var(--color-accent-primary)] p-6">
        <h1 className="text-3xl font-bold text-red-500">Error de confirmacion</h1>
        <p className="mt-3">No pudimos confirmar tu pago.</p>
        <p className="mt-2 text-sm opacity-80">
          Si ves el cobro en tu cuenta de Mercado Pago, no te preocupes, tu pedido esta siendo procesado.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/order"
            className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
          >
            Volver al menu
          </Link>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="mx-auto max-w-3xl rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
      <ClearCartOnSuccess />

      {order.fulfillmentStatus === "ready" ? (
        <div className="mb-6 rounded-sm bg-emerald-600/20 border border-emerald-500 p-4 text-emerald-300">
          <p className="font-bold text-xl uppercase tracking-wide">¡Tu pedido está listo para retirar!</p>
          <p className="mt-1 text-sm">Acercate al mostrador e indicá tu número de compra y código PIN.</p>
        </div>
      ) : order.fulfillmentStatus === "preparing" ? (
        <div className="mb-6 rounded-sm bg-amber-500/10 border border-amber-500/50 p-4 text-amber-300">
          <p className="font-semibold text-lg">Cocina está preparando tu pedido</p>
          {order.estimatedWaitMinutes ? (
            <p className="mt-1 text-sm opacity-90">Tiempo restante estimado: aprox. {order.estimatedWaitMinutes} minutos.</p>
          ) : null}
        </div>
      ) : order.fulfillmentStatus === "delivered" ? (
        <div className="mb-6 rounded-sm bg-zinc-800 border border-zinc-700 p-4 text-zinc-300">
          <p className="font-semibold text-lg">Pedido entregado. ¡Muchas gracias por tu compra!</p>
        </div>
      ) : order.fulfillmentStatus === "cancelled" ? (
        <div className="mb-6 rounded-sm bg-red-500/10 border border-red-500/50 p-4 text-red-300">
          <p className="font-bold text-xl uppercase tracking-wide">Pedido cancelado</p>
          <p className="mt-1 text-sm">Este pedido ya no está activo. Si pagaste, te devolvemos el importe.</p>
        </div>
      ) : (
        <h1 className="text-3xl font-bold">Pago confirmado</h1>
      )}

      <p className="mt-3">
        {order.purchaseNumber ? `Compra #${order.purchaseNumber}` : "Pedido confirmado"}
      </p>

      {order.purchaseNumber ? (
        <p className="mt-2 inline-flex rounded-full border border-[var(--color-accent-secondary)] px-4 py-2 text-sm font-semibold">
          Número de compra #{order.purchaseNumber}
        </p>
      ) : null}

      {order.pickupPin && order.fulfillmentStatus !== "cancelled" ? (
        <div className="mt-5 rounded-sm border-2 border-dashed border-[var(--color-accent-secondary)] bg-[var(--color-accent-secondary)]/10 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent-secondary)]">
            Código PIN de Retiro
          </p>
          <div className="mt-2 text-4xl font-extrabold tracking-widest font-mono">
            {order.pickupPin}
          </div>
          <p className="mt-2 text-xs opacity-80">
            Mostrá o decí este código en la caja para retirar tu pedido.
          </p>
        </div>
      ) : null}

      {order.fulfillmentStatus === "cancelled" ? null : order.hasCustomerPhone ? (
        <div className="mt-5 flex items-start gap-3 rounded-sm border border-[var(--color-accent-secondary)]/40 bg-[var(--color-accent-secondary)]/5 p-3.5 text-sm opacity-90">
          <span className="text-xl" aria-hidden>📲</span>
          <p>
            Guardá este código: el local te va a avisar por teléfono cuando tu pedido esté listo para retirar.
          </p>
        </div>
      ) : null}

      {order.tenantId && order.orderId ? (
        <div className="mt-5 flex flex-col items-center rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-secondary)]/5 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent-secondary)]">
            Código QR de seguimiento en vivo
          </p>
          <p className="mt-1 text-xs opacity-75">
            Escaneá con tu celular para seguir el estado de tu pedido en tiempo real
          </p>
          {qrDataUrl ? (
            <div className="mt-3 inline-block rounded bg-white p-2.5 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- inlined data: URL; next/image cannot fetch it and would need a remote loader */}
              <img
                src={qrDataUrl}
                alt={`QR de seguimiento para compra #${order.purchaseNumber}`}
                width={176}
                height={176}
                decoding="async"
                className="h-44 w-44"
              />
            </div>
          ) : null}
          <a
            href={orderTrackingPath(order.tenantId, order.orderId)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 text-xs underline opacity-80 hover:opacity-100"
          >
            Abrir página de seguimiento
          </a>
        </div>
      ) : null}

      <div className="mt-5 rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-secondary)]/10 p-4">
        <p className="font-bold uppercase tracking-wide">Importante para retirar</p>
        <p className="mt-2 text-sm">
          Para retirar tu pedido, vas a tener que indicar tu número de compra y código PIN en el mostrador.
        </p>
        <p className="mt-2 text-sm opacity-90">
          Recomendación: sacale screenshot a esta pantalla para tenerla a mano.
        </p>
      </div>
      <div className="mt-6 flex gap-3">
        <Link
          href="/order"
          className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
        >
          Volver al menu
        </Link>
      </div>
    </div>
  );
}
