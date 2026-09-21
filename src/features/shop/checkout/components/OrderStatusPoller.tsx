"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import ClearCartOnSuccess from "./ClearCartOnSuccess";

type OrderData = {
  orderId: string;
  purchaseNumber: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  pickupPin?: string | null;
  estimatedWaitMinutes?: number | null;
  estimatedReadyAt?: string | null;
};

export function OrderStatusPoller({ paymentId }: { paymentId: string }) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [status, setStatus] = useState<"polling" | "completed" | "timeout" | "error">("polling");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let attempts = 0;
    const maxAttempts = 100;

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
          purchaseNumber: string | null;
          fulfillmentStatus: string | null;
          paymentStatus: string | null;
          pickupPin?: string | null;
          estimatedWaitMinutes?: number | null;
          estimatedReadyAt?: string | null;
        };
        if (!mountedRef.current) return;
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
              purchaseNumber: data.purchaseNumber ?? "",
              fulfillmentStatus: data.fulfillmentStatus ?? "",
              paymentStatus: data.paymentStatus ?? "",
              pickupPin: data.pickupPin ?? null,
              estimatedWaitMinutes: data.estimatedWaitMinutes ?? null,
              estimatedReadyAt: data.estimatedReadyAt ?? null,
            };
          });
          setStatus("completed");
          if (data.fulfillmentStatus === "delivered" || data.fulfillmentStatus === "cancelled") {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        } else if (attempts >= maxAttempts) {
          setStatus("timeout");
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        if (!mountedRef.current) return;
        if (attempts >= maxAttempts) {
          setStatus("error");
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }
    };

    void poll();
    intervalRef.current = setInterval(poll, 3000);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paymentId]);

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

      {order.pickupPin ? (
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
