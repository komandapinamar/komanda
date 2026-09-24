"use client";

import { useEffect, useState } from "react";

type Status = {
  purchaseNumber: string;
  fulfillmentStatus: string;
  pickupPin?: string | null;
};

const labels: Record<string, string> = {
  approved: "Pedido recibido",
  preparing: "Estamos preparando tu pedido",
  ready: "¡Tu pedido está listo para retirar!",
  delivered: "Pedido entregado. ¡Muchas gracias por tu compra!",
  cancelled: "Pedido cancelado",
};

export function PublicOrderStatus({
  tenantId,
  orderId,
  initialOrder,
}: {
  tenantId: string;
  orderId: string;
  initialOrder?: Status | null;
}) {
  const [order, setOrder] = useState<Status | null>(initialOrder ?? null);
  const [error, setError] = useState<string | null>(null);

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
              "Accept": "application/json",
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
        const status = (await response.json()) as Status;
        if (!active) return;
        setOrder(status);
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
  }, [tenantId, orderId, order]);

  const isReady = order?.fulfillmentStatus === "ready";
  const isPreparing = order?.fulfillmentStatus === "preparing";
  const isDelivered = order?.fulfillmentStatus === "delivered";
  const isCancelled = order?.fulfillmentStatus === "cancelled";

  return (
    <main className="mx-auto max-w-xl p-6 sm:p-8 text-center text-[var(--color-accent-secondary)]">
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
            <p className="text-xl font-bold">
              {labels[order.fulfillmentStatus] ?? "Estado en actualización"}
            </p>
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

          {/* Purchase number badge */}
          <div className="inline-block rounded-full border border-[var(--color-accent-secondary)]/30 bg-zinc-900/60 px-6 py-2">
            <span className="text-lg font-semibold">
              Compra #{order.purchaseNumber}
            </span>
          </div>

          {/* Pickup PIN if present */}
          {order.pickupPin ? (
            <div className="rounded-xl border-2 border-dashed border-[var(--color-accent-secondary)]/40 bg-zinc-900/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Código PIN de Retiro
              </p>
              <p className="mt-1 font-mono text-4xl font-extrabold tracking-widest">
                {order.pickupPin}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Mostrá este código en el mostrador para retirar tu pedido.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {!order && !error ? (
        <div className="mt-8 flex flex-col items-center gap-3 text-zinc-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent-secondary)] border-t-transparent" />
          <p className="text-sm">Consultando tu pedido...</p>
        </div>
      ) : null}
    </main>
  );
}
