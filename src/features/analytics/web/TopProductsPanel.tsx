"use client";

import { useState } from "react";
import type { DashboardAnalyticsData } from "./analytics-types";

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

export default function TopProductsPanel({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const [metric, setMetric] = useState<"quantity" | "revenue">("quantity");
  const products =
    metric === "quantity"
      ? data.topProducts.byQuantity
      : data.topProducts.byRevenue;

  const maxVal =
    products.length > 0
      ? metric === "quantity"
        ? Math.max(...products.map((p) => p.totalQuantity), 1)
        : Math.max(...products.map((p) => Number(p.totalRevenue)), 1)
      : 1;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Productos Más Vendidos
          </h2>
          <p className="text-xs text-zinc-400">
            Ranking de desempeño por unidades y recaudación
          </p>
        </div>

        {/* Metric Selector */}
        <div className="flex items-center rounded-lg bg-zinc-800 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMetric("quantity")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              metric === "quantity"
                ? "bg-amber-400 text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Por Unidades
          </button>
          <button
            type="button"
            onClick={() => setMetric("revenue")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              metric === "revenue"
                ? "bg-amber-400 text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Por Facturación ($)
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="mt-8 flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 text-center text-zinc-500 text-xs">
          No hay ventas de productos en el período seleccionado.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {products.map((prod, index) => {
            const currentVal =
              metric === "quantity" ? prod.totalQuantity : Number(prod.totalRevenue);
            const percentage = Math.max(5, (currentVal / maxVal) * 100);

            return (
              <div key={`${prod.productName}-${index}`} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300">
                      #{index + 1}
                    </span>
                    <span className="font-semibold text-zinc-200">
                      {prod.productName}
                    </span>
                    {prod.categoryName && (
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {prod.categoryName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-400">
                      {prod.totalQuantity} u.
                    </span>
                    <span className="font-bold text-emerald-400">
                      {formatCurrency(prod.totalRevenue)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
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
  );
}
