"use client";

import { useEffect, useState } from "react";
import type {
  AdminDashboardOrder,
  CustomerInfo,
  OrderStatus,
} from "@/types/types";
import { nextOrderStatus, orderStage, type OrderStage } from "./order-workflow";

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

  if (source === "storefront_cash") return "Menú online · Efectivo";

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
    return "border-emerald-400/30 bg-emerald-500/15 text-emerald-300";
  }

  if (state === "reconnecting") {
    return "border-amber-400/30 bg-amber-500/15 text-amber-300";
  }

  return "border-white/12 bg-white/[0.04] text-[#c2c2cc]";
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
  const next = nextOrderStatus(order);
  const label = next === "ready" ? "Marcar listo en cocina" : next === "delivered" ? "Marcar como entregado" : null;
  if (!label) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onTransition(order)}
      className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#f4f3f1] px-5 text-xs font-medium text-[#141416] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
    >
      {disabled ? "Actualizando..." : label}
    </button>
  );
}

type AdminOrdersLiveProps = {
  initialOrders: AdminDashboardOrder[];
  tenantId: string;
  onOrdersChange?: (orders: AdminDashboardOrder[]) => void;
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
  scheduledFor?: string | null;
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
    scheduledFor: order.scheduledFor ?? null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="liquid-glass-card w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl">
        <h3 className="text-lg font-medium tracking-tight text-[#f4f3f1]">
          Cobrar en efectivo — Compra #{order.purchaseNumber}
        </h3>
        <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-center">
          <span className="block text-[11px] font-medium uppercase tracking-widest text-amber-300">
            Total a cobrar en efectivo
          </span>
          <span className="mt-1 block font-mono text-2xl font-bold text-amber-200">
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
            className={`rounded-full border px-3.5 py-2 text-xs font-medium transition ${
              authMethod === "pickup_pin"
                ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                : "border-white/12 bg-white/[0.04] text-[#c2c2cc]"
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
            className={`rounded-full border px-3.5 py-2 text-xs font-medium transition ${
              authMethod === "account_auth"
                ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                : "border-white/12 bg-white/[0.04] text-[#c2c2cc]"
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
            className="mt-4 w-full rounded-2xl border border-white/15 bg-[#101013] px-3.5 py-2.5 text-center font-mono text-2xl tracking-[0.4em] text-[#f4f3f1] outline-none focus:border-white/35"
          />
        ) : (
          <p className="mt-4 rounded-2xl border border-white/12 bg-[#101013]/90 p-3.5 text-xs text-[#c2c2cc]">
            Se autorizará el cobro con tu cuenta de usuario de Komanda
            actualmente autenticada.
          </p>
        )}

        {error ? (
          <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-[#f4f3f1] px-4 text-xs font-medium text-[#141416] transition hover:bg-white disabled:opacity-40"
          >
            {isSubmitting ? "Procesando..." : "Marcar como pagado"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-4 text-xs font-medium text-[#f4f3f1] transition hover:bg-white/[0.12] disabled:opacity-50"
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
  onOrdersChange,
}: AdminOrdersLiveProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [stageFilter, setStageFilter] = useState<"all" | Exclude<OrderStage, "finished">>("all");
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const activeOrders = orders.filter((order) => orderStage(order) !== "finished");
  const visibleOrders = activeOrders.filter((order) => stageFilter === "all" || orderStage(order) === stageFilter);
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
    onOrdersChange?.(orders);
  }, [orders, onOrdersChange]);

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
    const targetStatus = nextOrderStatus(order);
    if (!targetStatus) return;
    setTransitioningOrderId(order.id);
    setTransitionError(null);
    try {
      const response = await fetch(`/api/v1/tenants/${tenantId}/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/merge-patch+json",
          "If-Match": String(order.version),
        },
        body: JSON.stringify({
          fulfillmentStatus: targetStatus,
          pickupPin: targetStatus === "delivered" ? order.pickupPin || undefined : undefined,
        }),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: string } | null;
        if (response.status === 409) {
          const refresh = await fetch(`/api/v1/tenants/${tenantId}/orders/${order.id}`, { cache: "no-store" });
          if (refresh.ok) {
            const latest = toDashboardOrder(await refresh.json() as TenantOrderResponse);
            setOrders((current) => current.map((candidate) => candidate.id === latest.id ? latest : candidate));
          }
        }
        throw new Error(problem?.detail || "No se pudo actualizar el pedido. Revisá su estado e intentá nuevamente.");
      }
      const updated = toDashboardOrder((await response.json()) as TenantOrderResponse);
      setOrders((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : "Error de conexión al actualizar el pedido.");
    } finally {
      setTransitioningOrderId(null);
    }
  };

  return (
    <section className="liquid-prism-ring liquid-glass-card rounded-3xl p-6 sm:p-7">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">Activos</h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            {activeOrders.length} pedido{activeOrders.length === 1 ? "" : "s"} esperando entrega.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 ${connectionBadgeClassName(connectionState)}`}
          >
            <span className={`size-2 rounded-full ${connectionState === "live" ? "bg-emerald-400" : "bg-amber-400"}`} />
            Conexion {connectionLabel(connectionState)}
          </span>

          {lastUpdatedAt ? (
            <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[#c2c2cc]">
              Sync {formatDate(lastUpdatedAt)}
            </span>
          ) : null}
        </div>
      </div>

      <nav aria-label="Etapas del pedido" className="mt-5 flex flex-wrap gap-2">
        {([
          ["all", "Todos"],
          ["payment", "1. Pago"],
          ["kitchen", "2. Cocina"],
          ["delivery", "3. Entrega"],
        ] as const).map(([stage, label]) => (
          <button
            key={stage}
            type="button"
            aria-pressed={stageFilter === stage}
            onClick={() => setStageFilter(stage)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              stageFilter === stage
                ? "bg-[#f4f3f1] text-[#141416]"
                : "border border-white/12 bg-white/[0.04] text-[#d4d4dc] hover:bg-white/[0.1] hover:text-white"
            }`}
          >
            {label} ({activeOrders.filter((order) => stage === "all" || orderStage(order) === stage).length})
          </button>
        ))}
      </nav>
      {transitionError ? (
        <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3.5 text-xs text-red-300">
          {transitionError}
        </p>
      ) : null}

      {visibleOrders.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/12 bg-[#101013]/90 py-12 text-center">
          <p className="text-base font-medium text-[#f4f3f1]">
            No hay pedidos {stageFilter === "all" ? "en proceso" : "en esta etapa"}.
          </p>
          <p className="mt-1 text-xs text-[#c2c2cc]">
            Los pedidos se actualizan en vivo: pago → cocina → entrega.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {visibleOrders.map((order) => {
            const cashPending = isCashPending(order);
            return (
            <article
              key={order.id}
              className={`rounded-2xl border p-5 sm:p-6 ${
                cashPending
                  ? "border-amber-400/35 bg-amber-500/[0.06]"
                  : "border-white/12 bg-[#101013]/90"
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#f4f3f1] px-3 py-1 text-xs font-medium text-[#141416]">
                      Compra #{order.purchaseNumber}
                    </span>
                    {order.pickupPin ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                        PIN: #{order.pickupPin}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[#c2c2cc]">
                      {sourceLabel(order.source)}
                    </span>
                    {order.scheduledFor ? (
                      <span
                        data-testid="admin-order-scheduled-badge"
                        className="rounded-full border border-sky-400/30 bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-300"
                      >
                        Programado: {formatDate(order.scheduledFor)}
                      </span>
                    ) : null}
                    {cashPending ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
                        Pendiente de pago - Efectivo
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <h3 className="text-lg font-medium tracking-tight text-[#f4f3f1]">
                      {order.customer?.name || "Sin nombre"}
                    </h3>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[#c2c2cc]">
                      <span>Aprobado: {formatDate(order.approvedAt)}</span>
                      <span>Creado: {formatDate(order.createdAt)}</span>
                    </div>
                  </div>

                  <div className="text-xs text-[#d4d4dc] space-y-0.5">
                    <p className="text-sm font-medium text-[#f4f3f1]">
                      Estado:{" "}
                      {orderStage(order) === "payment" ? "Esperando pago" : statusLabel(order.status)}
                    </p>
                    {order.paymentStatus ? (
                      <p>Pago: {order.paymentStatus === "paid" ? "Pagado" : order.paymentStatus === "pending" ? "Pendiente" : order.paymentStatus === "verification_required" ? "Requiere verificación" : order.paymentStatus === "refunded" ? "Reembolsado" : "Fallido"}</p>
                    ) : null}
                    <p className="text-[#9b9ba4]">Pedido interno: {order.id}</p>
                  </div>

                  {order.notes ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-xs">
                      <p className="font-medium text-[#f4f3f1]">Notas</p>
                      <p className="mt-1 text-[#c2c2cc]">{order.notes}</p>
                    </div>
                  ) : null}

                  {order.lines && order.lines.length > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-[#141416]/90 p-4 text-xs">
                      <p className="mb-2.5 font-medium text-[#f4f3f1]">Productos</p>
                      <div className="divide-y divide-white/[0.08]">
                        {order.lines.map((line) => (
                          <div key={line.id} className="py-2 first:pt-0 last:pb-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <span className="font-medium text-[#f4f3f1]">
                                  {line.quantity}x {line.name}
                                </span>
                                {line.note ? (
                                  <p className="mt-0.5 text-xs text-[#c2c2cc]">{line.note}</p>
                                ) : null}
                                {line.options.length > 0 ? (
                                  <div className="mt-1 space-y-0.5 pl-3">
                                    {line.options.map((opt, optIdx) => (
                                      <p key={optIdx} className="text-xs text-[#c2c2cc]">
                                        + {opt.name}
                                        {Number(opt.priceDelta) > 0
                                          ? ` (+$${opt.priceDelta})`
                                          : ""}
                                      </p>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <span className="shrink-0 pl-2 font-mono text-xs text-[#f4f3f1] tabular-nums">
                                ${line.lineTotal}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 space-y-1 border-t border-white/[0.08] pt-2.5 text-xs">
                        <div className="flex justify-between text-[#c2c2cc]">
                          <span>Subtotal</span>
                          <span className="font-mono tabular-nums">${order.subtotal}</span>
                        </div>
                        {Number(order.discountTotal) > 0 ? (
                          <div className="flex justify-between text-emerald-400">
                            <span>Descuento</span>
                            <span className="font-mono tabular-nums">-${order.discountTotal}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between font-medium text-[#f4f3f1]">
                          <span>Total</span>
                          <span className="font-mono tabular-nums">
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
                        className="inline-flex h-10 w-full items-center justify-center rounded-full bg-amber-400 px-4 text-xs font-medium text-[#141416] transition hover:bg-amber-300"
                      >
                        Marcar como pagado · Efectivo
                      </button>
                      <p className="text-center text-xs text-[#c2c2cc]">
                        El pedido no se prepara hasta confirmar el cobro.
                      </p>
                    </div>
                  ) : orderStage(order) === "payment" ? (
                    <p className="text-xs text-[#c2c2cc]">
                      Esperando la confirmación del pago para enviar a cocina.
                    </p>
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
