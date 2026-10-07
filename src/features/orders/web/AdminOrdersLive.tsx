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
  if (source === "admin_direct") {
    return "Creado por admin";
  }

  if (source === "mercadopago_webhook") {
    return "Pago Mercado Pago";
  }

  return "Origen no disponible";
}

function statusLabel(status: OrderStatus) {
  switch (status) {
    case "approved":
    case "preparing":
      return "Preparando";
    case "ready":
      return "Listo para entregar";
    case "delivered":
      return "Entregado";
    case "cancelled":
      return "Cancelado";
  }
}

function nextStatus(status: OrderStatus): OrderStatus | null {
  switch (status) {
    case "approved":
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
  if (next === "ready") return "Listo para entregar";
  if (next === "delivered") return "Entregado";
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

type TenantOrderLineResponse = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  note: string | null;
  options: Array<{
    name: string;
    priceDelta: string;
    quantity: number;
  }>;
};

type TenantOrderResponse = {
  id: string;
  purchaseNumber: string | number;
  fulfillmentStatus: OrderStatus;
  paymentStatus: "pending" | "paid" | "failed" | "refunded" | "verification_required";
  customer?: Record<string, unknown>;
  notes: string | null;
  source: AdminDashboardOrder["source"];
  lines: TenantOrderLineResponse[];
  subtotal: string;
  discountTotal: string;
  total: string;
  currency: string;
  tender?: "cash" | "posnet" | null;
  pickupPin?: string | null;
  paymentExpiresAt?: string | null;
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

function isCashPending(order: AdminDashboardOrder): boolean {
  return (
    order.tender === "cash" &&
    order.paymentStatus === "pending" &&
    order.status !== "cancelled" &&
    order.status !== "delivered"
  );
}

function toDashboardOrder(order: TenantOrderResponse): AdminDashboardOrder {
  return {
    id: order.id,
    purchaseNumber: String(order.purchaseNumber),
    status: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    customer: (order.customer ?? { name: "Cliente" }) as CustomerInfo,
    notes: order.notes,
    source: order.source,
    lines: order.lines.map((line) => ({
      id: line.id,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      note: line.note,
      options: line.options.map((opt) => ({
        name: opt.name,
        priceDelta: opt.priceDelta,
        quantity: opt.quantity,
      })),
    })),
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    currency: order.currency,
    tender: order.tender ?? null,
    pickupPin: order.pickupPin ?? null,
    paymentExpiresAt: order.paymentExpiresAt ?? null,
    approvedAt: order.approvedAt,
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    version: order.version,
  };
}

type CollectCashResult = {
  orderId: string;
  paymentStatus: string;
  paidAt?: string;
  version?: number;
};

function CollectCashDialog({
  order,
  tenantId,
  onClose,
  onCollected,
}: {
  order: AdminDashboardOrder;
  tenantId: string;
  onClose: () => void;
  onCollected: (orderId: string, version?: number) => void;
}) {
  const [authMethod, setAuthMethod] = useState<"pickup_pin" | "account_auth">(
    "pickup_pin",
  );
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm =
    !isSubmitting && (authMethod === "account_auth" || /^\d{4}$/.test(pin));

  const confirm = async () => {
    if (!canConfirm) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/tenants/${tenantId}/orders/${order.id}/collect-cash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            authMethod,
            ...(authMethod === "pickup_pin" ? { authCode: pin } : {}),
          }),
        },
      );
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          code?: string;
          detail?: string;
        } | null;
        const message =
          problem?.code === "INVALID_PICKUP_PIN"
            ? "El PIN ingresado es incorrecto."
            : problem?.code === "NO_OPEN_CASH_SHIFT"
              ? "No hay un turno de caja abierto."
              : problem?.detail || "No se pudo registrar el cobro.";
        setError(message);
        setIsSubmitting(false);
        return;
      }
      const result = (await response.json()) as CollectCashResult;
      onCollected(order.id, result.version);
      onClose();
    } catch {
      setError("Error de conexión. Intente nuevamente.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
        <h3 className="text-lg font-bold">
          Cobrar en efectivo — Compra #{order.purchaseNumber}
        </h3>
        <p className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 text-center">
          <span className="block text-xs uppercase tracking-widest text-amber-500">
            Total a cobrar en efectivo
          </span>
          <span className="mt-1 block font-mono text-2xl font-black text-amber-400">
            ${order.total} {order.currency}
          </span>
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setAuthMethod("pickup_pin");
              setError(null);
            }}
            className={`rounded-sm border px-3 py-2 text-sm font-semibold ${
              authMethod === "pickup_pin"
                ? "border-amber-500 bg-amber-500/15 text-amber-300"
                : "border-[var(--color-accent-secondary)]/40 opacity-75"
            }`}
          >
            PIN del pedido
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod("account_auth");
              setError(null);
            }}
            className={`rounded-sm border px-3 py-2 text-sm font-semibold ${
              authMethod === "account_auth"
                ? "border-amber-500 bg-amber-500/15 text-amber-300"
                : "border-[var(--color-accent-secondary)]/40 opacity-75"
            }`}
          >
            Confirmar con mi cuenta
          </button>
        </div>

        {authMethod === "pickup_pin" ? (
          <input
            value={pin}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(next);
              setError(null);
            }}
            inputMode="numeric"
            placeholder="PIN de 4 dígitos"
            className="mt-4 w-full rounded-sm border border-[var(--color-accent-secondary)]/50 bg-transparent px-3 py-2 text-center font-mono text-2xl tracking-[0.4em] outline-none"
          />
        ) : (
          <p className="mt-4 rounded-sm border border-[var(--color-accent-secondary)]/20 p-3 text-sm opacity-80">
            Se autorizará el cobro con tu cuenta de usuario de Komanda
            actualmente autenticada.
          </p>
        )}

        {error ? (
          <p className="mt-3 rounded-sm border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="flex-1 rounded-sm bg-amber-500 px-4 py-3 font-bold text-zinc-950 disabled:opacity-50"
          >
            {isSubmitting ? "Procesando..." : "Confirmar cobro"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-sm border border-[var(--color-accent-secondary)]/40 px-4 py-3 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
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
  const [collectingOrder, setCollectingOrder] =
    useState<AdminDashboardOrder | null>(null);

  const handleCollected = (orderId: string, version?: number) => {
    setOrders((current) =>
      current.map((candidate) =>
        candidate.id === orderId
          ? {
              ...candidate,
              paymentStatus: "paid" as const,
              version: version ?? candidate.version,
            }
          : candidate,
      ),
    );
    setLastUpdatedAt(new Date().toISOString());
  };

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
        body: JSON.stringify({
          fulfillmentStatus: targetStatus,
          pickupPin: order.pickupPin || undefined,
        }),
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
          {orders.map((order) => {
            const cashPending = isCashPending(order);
            return (
            <article
              key={order.id}
              className={`rounded-sm border p-5 ${
                cashPending
                  ? "border-amber-500 bg-amber-500/5"
                  : "border-[var(--color-accent-secondary)]/30 bg-[var(--color-accent-primary)]"
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[var(--color-accent-secondary)] px-3 py-1 text-sm font-bold text-[var(--color-accent-primary)]">
                      Compra #{order.purchaseNumber}
                    </span>
                    {order.pickupPin ? (
                      <span className="rounded-full border border-emerald-400 bg-emerald-500/10 px-3 py-1 text-sm font-black text-emerald-400">
                        PIN: #{order.pickupPin}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-[var(--color-accent-secondary)]/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em]">
                      {sourceLabel(order.source)}
                    </span>
                    {cashPending ? (
                      <span className="rounded-full border border-amber-500 bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-amber-400">
                        Pendiente de pago - Efectivo
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <h3 className="text-xl font-bold">{order.customer?.name || "Sin nombre"}</h3>
                    <p className="text-sm opacity-75">Aprobado: {formatDate(order.approvedAt)}</p>
                    <p className="text-sm opacity-75">Creado: {formatDate(order.createdAt)}</p>
                  </div>

                  <div className="text-sm opacity-85">
                    <p className="text-base font-extrabold uppercase">
                      Estado:{" "}
                      {cashPending
                        ? "Esperando pago en caja"
                        : statusLabel(order.status)}
                    </p>
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

                  {order.lines && order.lines.length > 0 ? (
                    <div className="rounded-sm border border-[var(--color-accent-secondary)]/20 bg-[var(--color-accent-primary)] p-3 text-sm">
                      <p className="mb-2 font-semibold">Productos</p>
                      <div className="space-y-2">
                        {order.lines.map((line) => (
                          <div key={line.id} className="border-b border-[var(--color-accent-secondary)]/10 pb-2 last:border-0 last:pb-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <span className="font-medium">
                                  {line.quantity}x {line.name}
                                </span>
                                {line.note ? (
                                  <p className="mt-0.5 text-xs opacity-70">{line.note}</p>
                                ) : null}
                                {line.options.length > 0 ? (
                                  <div className="mt-1 space-y-0.5 pl-3">
                                    {line.options.map((opt, optIdx) => (
                                      <p key={optIdx} className="text-xs opacity-70">
                                        + {opt.name}
                                        {Number(opt.priceDelta) > 0
                                          ? ` (+$${opt.priceDelta})`
                                          : ""}
                                      </p>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <span className="shrink-0 pl-2 font-mono text-xs">
                                ${line.lineTotal}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 space-y-1 border-t border-[var(--color-accent-secondary)]/20 pt-2 text-xs">
                        <div className="flex justify-between">
                          <span>Subtotal</span>
                          <span className="font-mono">${order.subtotal}</span>
                        </div>
                        {Number(order.discountTotal) > 0 ? (
                          <div className="flex justify-between text-red-400">
                            <span>Descuento</span>
                            <span className="font-mono">-${order.discountTotal}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between font-semibold">
                          <span>Total</span>
                          <span className="font-mono">
                            ${order.total} {order.currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 lg:w-56">
                  {cashPending ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setCollectingOrder(order)}
                        className="w-full rounded-sm bg-amber-500 px-4 py-3 text-sm font-bold text-zinc-950"
                      >
                        Cobrar en efectivo
                      </button>
                      <p className="text-center text-xs opacity-70">
                        El pedido no se prepara hasta confirmar el cobro.
                      </p>
                    </div>
                  ) : (
                    <TenantTransitionButton
                      order={order}
                      disabled={transitioningOrderId === order.id}
                      onTransition={transitionTenantOrder}
                    />
                  )}
                </div>
              </div>
            </article>
            );
          })}
        </div>
      )}

      {collectingOrder ? (
        <CollectCashDialog
          order={collectingOrder}
          tenantId={tenantId}
          onClose={() => setCollectingOrder(null)}
          onCollected={handleCollected}
        />
      ) : null}
    </section>
  );
}
