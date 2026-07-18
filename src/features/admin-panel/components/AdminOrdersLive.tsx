"use client";

import { useEffect, useState } from "react";
import type {
  AdminDashboardOrder,
  CustomerInfo,
  OrderStatus,
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
  if (source === "admin-direct" || source === "admin_direct") {
    return "Creado por admin";
  }

  if (source === "mercadopago-webhook" || source === "mercadopago_webhook") {
    return "Pago Mercado Pago";
  }

  return "Origen no disponible";
}

function statusLabel(status: OrderStatus) {
  switch (status) {
    case "approved":
      return "Aprobado";
    case "preparing":
      return "En preparación";
    case "ready":
      return "Listo";
    case "delivered":
      return "Entregado";
    case "cancelled":
      return "Cancelado";
  }
}

function nextStatus(status: OrderStatus): OrderStatus | null {
  switch (status) {
    case "approved":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return "delivered";
    case "delivered":
    case "cancelled":
      return null;
  }
}

function nextStatusLabel(status: OrderStatus) {
  const next = nextStatus(status);
  if (next === "preparing") return "Preparar";
  if (next === "ready") return "Marcar listo";
  if (next === "delivered") return "Marcar entregado";
  return null;
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

function TenantTransitionButton({
  order,
  disabled,
  onTransition,
}: {
  order: AdminDashboardOrder;
  disabled: boolean;
  onTransition: (order: AdminDashboardOrder) => void;
}) {
  const label = nextStatusLabel(order.status);
  if (!label) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onTransition(order)}
      className="w-full rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 text-sm font-semibold text-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
    >
      {disabled ? "Actualizando..." : label}
    </button>
  );
}

type AdminOrdersLiveProps = {
  initialOrders: AdminDashboardOrder[];
  tenantId: string;
};

type TenantOrderResponse = {
  id: string;
  purchaseNumber: string | number;
  fulfillmentStatus: OrderStatus;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  customer?: Record<string, unknown>;
  notes: string | null;
  source: AdminDashboardOrder["source"];
  approvedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

type TenantOrderEvent = {
  orderId: string;
  sequence: string;
};

function toDashboardOrder(order: TenantOrderResponse): AdminDashboardOrder {
  return {
    id: order.id,
    purchaseNumber: String(order.purchaseNumber),
    status: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    customer: (order.customer ?? { name: "Cliente" }) as CustomerInfo,
    notes: order.notes,
    source: order.source,
    approvedAt: order.approvedAt,
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    version: order.version,
  };
}

export default function AdminOrdersLive({
  initialOrders,
  tenantId,
}: AdminOrdersLiveProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [transitioningOrderId, setTransitioningOrderId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    let isActive = true;
    const eventSource = new EventSource(
      `/api/v1/tenants/${tenantId}/orders/events`,
    );

    eventSource.onopen = () => {
      if (!isActive) {
        return;
      }

      setConnectionState("live");
    };

    const handleOrderEvent = (event: MessageEvent<string>) => {
      if (!isActive) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as TenantOrderEvent;
        void fetch(`/api/v1/tenants/${tenantId}/orders/${payload.orderId}`, {
            cache: "no-store",
          })
            .then((response) => {
              if (!response.ok) throw new Error("Failed to refresh order.");
              return response.json() as Promise<TenantOrderResponse>;
            })
            .then((order) => {
              if (!isActive) return;
              const dashboardOrder = toDashboardOrder(order);
              setOrders((current) => {
                const rest = current.filter(({ id }) => id !== dashboardOrder.id);
                return [dashboardOrder, ...rest].sort((left, right) =>
                  right.updatedAt.localeCompare(left.updatedAt),
                );
              });
              setLastUpdatedAt(new Date().toISOString());
            })
            .catch((error) => {
              console.error("[admin-dashboard] Failed to refresh order.", error);
            });
        setConnectionState("live");
      } catch (error) {
        console.error("[admin-dashboard] Failed to parse orders stream payload.", error);
      }
    };
    eventSource.onmessage = handleOrderEvent;
    eventSource.addEventListener("order", handleOrderEvent);

    eventSource.onerror = () => {
      if (!isActive) {
        return;
      }

      setConnectionState("reconnecting");
    };

    return () => {
      isActive = false;
      eventSource.removeEventListener("order", handleOrderEvent);
      eventSource.close();
    };
  }, [tenantId]);

  const transitionTenantOrder = async (order: AdminDashboardOrder) => {
    if (!order.version) return;
    const targetStatus = nextStatus(order.status);
    if (!targetStatus) return;
    setTransitioningOrderId(order.id);
    try {
      const response = await fetch(`/api/v1/tenants/${tenantId}/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/merge-patch+json",
          "If-Match": String(order.version),
        },
        body: JSON.stringify({ fulfillmentStatus: targetStatus }),
      });
      if (!response.ok) throw new Error("Failed to transition order.");
      const updated = toDashboardOrder((await response.json()) as TenantOrderResponse);
      setOrders((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
      setLastUpdatedAt(new Date().toISOString());
    } finally {
      setTransitioningOrderId(null);
    }
  };

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
                    <p>Estado: {statusLabel(order.status)}</p>
                    {order.paymentStatus ? (
                      <p>Pago: {order.paymentStatus}</p>
                    ) : null}
                    <p>Pedido interno: {order.id}</p>
                  </div>

                  {order.notes ? (
                    <div className="rounded-sm border border-[var(--color-accent-secondary)]/20 bg-[var(--color-accent-primary)] p-3 text-sm">
                      <p className="font-semibold">Notas</p>
                      <p className="mt-1 opacity-80">{order.notes}</p>
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0">
                  <TenantTransitionButton
                    order={order}
                    disabled={transitioningOrderId === order.id}
                    onTransition={transitionTenantOrder}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
