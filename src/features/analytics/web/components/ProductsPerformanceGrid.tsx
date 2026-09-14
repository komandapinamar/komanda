"use client";

import { useState } from "react";
import type { DashboardAnalyticsData } from "../analytics-types";

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

function getSuggestionBadgeClass(suggestion: string): string {
  if (suggestion === "Falta foto en carta") {
    return "border border-red-500/30 bg-red-950/40 text-red-300";
  }
  if (suggestion === "Probar foto nueva") {
    return "border border-amber-500/30 bg-amber-950/40 text-amber-300";
  }
  // "Revisar precio"
  return "border border-sky-500/30 bg-sky-950/40 text-sky-300";
}

export default function ProductsPerformanceGrid({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const [topMetric, setTopMetric] = useState<"quantity" | "revenue">("quantity");

  const topProducts =
    topMetric === "quantity"
      ? data.topProducts.byQuantity
      : data.topProducts.byRevenue;

  const maxVal =
    topProducts.length > 0
      ? topMetric === "quantity"
        ? Math.max(...topProducts.map((p) => p.totalQuantity), 1)
        : Math.max(...topProducts.map((p) => Number(p.totalRevenue)), 1)
      : 1;

  const unconverted = data.unconvertedProducts ?? [];

  return (
    <div className="font-[family-name:var(--font-instrument-sans)] grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left Column: Top Selling Products */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Platos Más Pedidos
            </h2>
            <p className="text-xs text-zinc-400">
              Ranking de salida en cocina y facturación
            </p>
          </div>

          <div className="flex items-center rounded-lg bg-zinc-800 p-1 text-xs">
            <button
              type="button"
              onClick={() => setTopMetric("quantity")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                topMetric === "quantity"
                  ? "bg-amber-400 text-zinc-950 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Por Unidades
            </button>
            <button
              type="button"
              onClick={() => setTopMetric("revenue")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                topMetric === "revenue"
                  ? "bg-amber-400 text-zinc-950 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Por Facturación ($)
            </button>
          </div>
        </div>

        {topProducts.length === 0 ? (
          <div className="mt-8 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
            No hay ventas de platos en el período seleccionado.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {topProducts.slice(0, 7).map((prod, index) => {
              const currentVal =
                topMetric === "quantity"
                  ? prod.totalQuantity
                  : Number(prod.totalRevenue);
              const percentage = Math.max(5, (currentVal / maxVal) * 100);

              return (
                <div key={`${prod.productName}-${index}`} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300">
                        #{index + 1}
                      </span>
                      <span className="font-semibold text-zinc-200 truncate">
                        {prod.productName}
                      </span>
                      {prod.categoryName && (
                        <span className="hidden sm:inline-block rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 truncate">
                          {prod.categoryName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-zinc-400">
                        {prod.totalQuantity} u.
                      </span>
                      <span className="font-bold text-emerald-400">
                        {formatCurrency(prod.totalRevenue)}
                      </span>
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      style={{ width: `${percentage}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Column: Viewed Without Sales (M-32) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-100">
              Platos que Miran Mucho pero No Piden
            </h2>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-700/60">
              M-32
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Alta atención en menú QR pero conversión menor al 5%
          </p>
        </div>

        {unconverted.length === 0 ? (
          <div className="mt-8 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500 space-y-1">
            <p className="font-medium text-zinc-400">
              Excelente rendimiento del menú
            </p>
            <p>
              No hay platos con fricción alta en este período (mínimo 10 visitas con conversión menor o igual a 5%).
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3.5">
            {unconverted.slice(0, 6).map((item) => {
              return (
                <div
                  key={item.itemId}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-3 text-xs transition-colors hover:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-200 truncate">
                          {item.productName}
                        </span>
                        {item.categoryName && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 truncate">
                            {item.categoryName}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-400 text-[11px]">
                        <span>
                          <strong className="text-zinc-200">
                            {item.qualifiedViews}
                          </strong>{" "}
                          visitas
                        </span>
                        <span>
                          <strong className="text-zinc-200">
                            {item.purchasesCount}
                          </strong>{" "}
                          pedidos
                        </span>
                        <span>
                          Conversión:{" "}
                          <strong
                            className={
                              item.conversionRate === 0
                                ? "text-red-400 font-semibold"
                                : "text-amber-400 font-semibold"
                            }
                          >
                            {item.conversionRate.toFixed(1)}%
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Operational Suggestion Badge */}
                    <div className="shrink-0">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-tight ${getSuggestionBadgeClass(
                          item.suggestion,
                        )}`}
                      >
                        {item.suggestion}
                      </span>
                    </div>
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
