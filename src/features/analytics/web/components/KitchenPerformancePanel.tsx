"use client";

import type { DashboardAnalyticsData } from "../analytics-types";

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

export default function KitchenPerformancePanel({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const kitchen = data.kitchenDelays;
  const waiting = kitchen?.waitingMinutes;
  const prep = kitchen?.preparationMinutes;
  const total = kitchen?.totalTimeMinutes;
  const pendingOrders = kitchen?.pendingOrders ?? [];
  const cancelledBeforeCooking = kitchen?.cancelledBeforeCookingCount ?? 0;

  return (
    <div className="font-[family-name:var(--font-instrument-sans)] rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Demoras en Cocina
          </h2>
          <p className="text-xs text-zinc-400">
            Tiempos observados de preparación y comandas en curso
          </p>
        </div>

        {cancelledBeforeCooking > 0 && (
          <span className="self-start sm:self-auto rounded-full bg-zinc-800 px-3 py-1 text-[11px] font-medium text-zinc-400 border border-zinc-700/60">
            Cancelados antes de cocinar:{" "}
            <strong className="text-zinc-200">{cancelledBeforeCooking}</strong>
          </span>
        )}
      </div>

      {/* 3 Metric Cards for Observed Kitchen Times */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Waiting Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Espera de Cocina
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">
              {waiting ? `${waiting.p50} min` : "--"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
            <span>
              p90:{" "}
              <strong className="text-(--color-accent-tertiary) font-semibold">
                {waiting ? `${waiting.p90} min` : "--"}
              </strong>
            </span>
            <span className="text-[11px] text-zinc-500">
              Base: {waiting?.sampleSize ?? 0} pedidos
            </span>
          </div>
        </div>

        {/* Preparation Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Preparación
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">
              {prep ? `${prep.p50} min` : "--"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
            <span>
              p90:{" "}
              <strong className="text-(--color-accent-tertiary) font-semibold">
                {prep ? `${prep.p90} min` : "--"}
              </strong>
            </span>
            <span className="text-[11px] text-zinc-500">
              Base: {prep?.sampleSize ?? 0} pedidos
            </span>
          </div>
        </div>

        {/* Total Time Until Ready Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Tiempo Total Hasta Listo
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">
              {total ? `${total.p50} min` : "--"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
            <span>
              p90:{" "}
              <strong className="text-(--color-accent-tertiary) font-semibold">
                {total ? `${total.p90} min` : "--"}
              </strong>
            </span>
            <span className="text-[11px] text-zinc-500">
              Base: {total?.sampleSize ?? 0} pedidos
            </span>
          </div>
        </div>
      </div>

      {/* Pending Orders Queue */}
      <div className="space-y-3 pt-2 border-t border-zinc-800/80">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">
            Comandas en Curso ({pendingOrders.length})
          </h3>
          <span className="text-[11px] text-zinc-500">
            Ordenadas por mayor tiempo de espera
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
            No hay comandas pendientes en cocina en este momento.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-60 divide-y divide-zinc-800/60 rounded-lg border border-zinc-800 bg-zinc-950/40">
            {pendingOrders.map((order) => {
              const isUrgent = order.waitingAgeMinutes >= 25;
              const isModerate = order.waitingAgeMinutes >= 15;

              return (
                <div
                  key={order.orderId}
                  className="flex items-center justify-between px-4 py-3 text-xs hover:bg-zinc-900/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-zinc-200">
                      Comanda #{order.purchaseNumber}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        order.fulfillmentStatus === "preparing"
                          ? "bg-(--color-accent-tertiary)/10 text-amber-300 border border-(--color-accent-tertiary)/20"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700/40"
                      }`}
                    >
                      {order.fulfillmentStatus === "preparing"
                        ? "En cocina"
                        : "En cola"}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`font-semibold ${
                        isUrgent
                          ? "text-red-400"
                          : isModerate
                          ? "text-(--color-accent-tertiary)"
                          : "text-zinc-300"
                      }`}
                    >
                      {order.waitingAgeMinutes} min de espera
                    </span>
                    <span className="font-medium text-emerald-400 min-w-16 text-right">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
