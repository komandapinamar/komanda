"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { markOrderDelivered } from "@/features/admin-panel/actions/mark-order-delivered.action";
import type {
  AdminDashboardOrder,
  AdminOrdersStreamPayload,
} from "@/types/types";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

type ConnectionState = "connecting" | "live" | "reconnecting";

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}

function sourceLabel(source: string | null) {
  if (source === "admin-direct") {
    return "Creado por admin";
  }

  if (source === "mercadopago-webhook") {
    return "Pago Mercado Pago";
  }

  return "Origen no disponible";
}

function connectionLabel(state: ConnectionState) {
  if (state === "live") {
    return "En vivo";
  }

  if (state === "reconnecting") {
    return "Reconectando";
  }

  return "Conectando";
}

function connectionBadgeClassName(state: ConnectionState) {
  if (state === "live") {
    return "border-emerald-600/40 bg-emerald-600/10 text-emerald-700";
  }

  if (state === "reconnecting") {
    return "border-amber-600/40 bg-amber-600/10 text-amber-700";
  }

  return "border-[var(--color-accent-secondary)]/20 bg-[var(--color-accent-secondary)]/10 text-[var(--color-accent-secondary)]";
}

function DeliverButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 text-sm font-semibold text-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
    >
      {pending ? "Marcando..." : "Marcar como entregado"}
    </button>
  );
}

type AdminOrdersLiveProps = {
  initialOrders: AdminDashboardOrder[];
};

export default function AdminOrdersLive({ initialOrders }: AdminOrdersLiveProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    let isActive = true;
    const eventSource = new EventSource("/api/admin/orders/stream");

    eventSource.onopen = () => {
      if (!isActive) {
        return;
      }

      setConnectionState("live");
    };

    eventSource.onmessage = (event) => {
      if (!isActive) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as AdminOrdersStreamPayload;
        setOrders(payload.orders);
        setLastUpdatedAt(payload.generatedAt);
        setConnectionState("live");
      } catch (error) {
        console.error("[admin-dashboard] Failed to parse orders stream payload.", error);
      }
    };

    eventSource.onerror = () => {
      if (!isActive) {
        return;
      }

      setConnectionState("reconnecting");
    };

    return () => {
      isActive = false;
      eventSource.close();
    };
  }, []);

  return (
    <section className="rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
      <div className="flex flex-col gap-4 border-b border-[var(--color-accent-secondary)]/20 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Activos</h2>
          <p className="text-sm opacity-75">
            {orders.length} pedido{orders.length === 1 ? "" : "s"} esperando entrega.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.15em]">
          <span
            className={`rounded-full border px-3 py-1 ${connectionBadgeClassName(connectionState)}`}
          >
            Conexion {connectionLabel(connectionState)}
          </span>

          {lastUpdatedAt ? (
            <span className="rounded-full border border-[var(--color-accent-secondary)]/20 px-3 py-1 opacity-75">
              Sync {formatDate(lastUpdatedAt)}
            </span>
          ) : null}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-lg font-semibold">No hay pedidos en proceso.</p>
          <p className="mt-2 text-sm opacity-75">
            Cuando entre un nuevo pedido aprobado va a aparecer aca.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {orders.map((order) => (
            <article
              key={order.id}
              className="rounded-sm border border-[var(--color-accent-secondary)]/30 bg-[var(--color-accent-primary)] p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[var(--color-accent-secondary)] px-3 py-1 text-sm font-bold text-[var(--color-accent-primary)]">
                      Compra #{order.purchaseNumber}
                    </span>
                    <span className="rounded-full border border-[var(--color-accent-secondary)]/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em]">
                      {sourceLabel(order.source)}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold">{order.customer.name}</h3>
                    <p className="text-sm opacity-75">Aprobado: {formatDate(order.approvedAt)}</p>
                    <p className="text-sm opacity-75">Creado: {formatDate(order.createdAt)}</p>
                  </div>

                  <div className="text-sm opacity-85">
                    <p>Estado: En proceso</p>
                    <p>Pedido interno: {order.id}</p>
                  </div>

                  {order.notes ? (
                    <div className="rounded-sm border border-[var(--color-accent-secondary)]/20 bg-[var(--color-accent-primary)] p-3 text-sm">
                      <p className="font-semibold">Notas</p>
                      <p className="mt-1 opacity-80">{order.notes}</p>
                    </div>
                  ) : null}
                </div>

                <form action={markOrderDelivered} className="shrink-0">
                  <input type="hidden" name="orderId" value={order.id} />
                  <DeliverButton />
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
