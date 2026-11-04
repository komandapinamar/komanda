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
    <div className="font-[family-name:var(--font-instrument-sans)] liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
            Demoras en Cocina
          </h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Tiempos observados de preparación y comandas en curso
          </p>
        </div>

        {cancelledBeforeCooking > 0 && (
          <span className="self-start sm:self-auto rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-[#c2c2cc]">
            Cancelados antes de cocinar:{" "}
            <strong className="text-[#f4f3f1]">{cancelledBeforeCooking}</strong>
          </span>
        )}
      </div>

      {/* 3 Metric Cards for Observed Kitchen Times */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Waiting Card */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
            Espera de Cocina
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
              {waiting ? `${waiting.p50} min` : "--"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-[#c2c2cc]">
            <span>
              p90:{" "}
              <strong className="text-[#f4f3f1] font-medium">
                {waiting ? `${waiting.p90} min` : "--"}
              </strong>
            </span>
            <span className="text-[11px] text-[#9b9ba4]">
              Base: {waiting?.sampleSize ?? 0} pedidos
            </span>
          </div>
        </div>

        {/* Preparation Card */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
            Preparación
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
              {prep ? `${prep.p50} min` : "--"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-[#c2c2cc]">
            <span>
              p90:{" "}
              <strong className="text-[#f4f3f1] font-medium">
                {prep ? `${prep.p90} min` : "--"}
              </strong>
            </span>
            <span className="text-[11px] text-[#9b9ba4]">
              Base: {prep?.sampleSize ?? 0} pedidos
            </span>
          </div>
        </div>

        {/* Total Time Until Ready Card */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
            Tiempo Total Hasta Listo
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
              {total ? `${total.p50} min` : "--"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-[#c2c2cc]">
            <span>
              p90:{" "}
              <strong className="text-[#f4f3f1] font-medium">
                {total ? `${total.p90} min` : "--"}
              </strong>
            </span>
            <span className="text-[11px] text-[#9b9ba4]">
              Base: {total?.sampleSize ?? 0} pedidos
            </span>
          </div>
        </div>
      </div>

      {/* Pending Orders Queue */}
      <div className="space-y-3 pt-2 border-t border-white/[0.08]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[#f4f3f1]">
            Comandas en Curso ({pendingOrders.length})
          </h3>
          <span className="text-xs text-[#9b9ba4]">
            Ordenadas por mayor tiempo de espera
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#101013]/90 text-center text-xs text-[#c2c2cc]">
            No hay comandas pendientes en cocina en este momento.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-60 divide-y divide-white/[0.08] rounded-2xl border border-white/12 bg-[#101013]/90">
            {pendingOrders.map((order) => {
              const isUrgent = order.waitingAgeMinutes >= 25;
              const isModerate = order.waitingAgeMinutes >= 15;

              return (
                <div
                  key={order.orderId}
                  className="flex items-center justify-between px-4 py-3 text-xs hover:bg-white/[0.03] transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[#f4f3f1]">
                      Comanda #{order.purchaseNumber}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                        order.fulfillmentStatus === "preparing"
                          ? "border-amber-400/30 bg-amber-500/15 text-amber-300"
                          : "border-white/12 bg-white/[0.04] text-[#c2c2cc]"
                      }`}
                    >
                      {order.fulfillmentStatus === "preparing"
                        ? "En cocina"
                        : "En cola"}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 tabular-nums">
                    <span
                      className={`font-medium ${
                        isUrgent
                          ? "text-red-400"
                          : isModerate
                          ? "text-amber-300"
                          : "text-[#d4d4dc]"
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
