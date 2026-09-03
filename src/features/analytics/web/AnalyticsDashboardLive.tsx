"use client";

import { useState, useTransition } from "react";
import type { DashboardAnalyticsData, DatePreset } from "./analytics-types";
import { fetchDashboardAnalytics } from "./analytics-http";
import KpiCards from "./KpiCards";
import RevenueTimelineChart from "./RevenueTimelineChart";
import DwellTimeChart from "./DwellTimeChart";
import TopProductsPanel from "./TopProductsPanel";
import FinancialSummaryPanel from "./FinancialSummaryPanel";

function getDateRangeForPreset(preset: DatePreset): {
  from: string;
  to: string;
  granularity: "hour" | "day" | "week" | "month";
} {
  const now = new Date();
  const to = now.toISOString();

  if (preset === "today") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    return {
      from: startOfToday.toISOString(),
      to,
      granularity: "hour",
    };
  }

  if (preset === "30d") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      from: thirtyDaysAgo.toISOString(),
      to,
      granularity: "day",
    };
  }

  if (preset === "month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return {
      from: startOfMonth.toISOString(),
      to,
      granularity: "day",
    };
  }

  // Default: 7d
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from: sevenDaysAgo.toISOString(),
    to,
    granularity: "day",
  };
}

export default function AnalyticsDashboardLive({
  tenantId,
  initialData,
}: {
  tenantId: string;
  initialData: DashboardAnalyticsData;
}) {
  const [data, setData] = useState<DashboardAnalyticsData>(initialData);
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [source, setSource] = useState<"all" | "mercadopago_webhook" | "admin_direct">("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handlePresetChange = (newPreset: DatePreset) => {
    setPreset(newPreset);
    if (newPreset !== "custom") {
      const range = getDateRangeForPreset(newPreset);
      loadMetrics({
        from: range.from,
        to: range.to,
        granularity: range.granularity,
        source,
      });
    }
  };

  const handleSourceChange = (newSource: "all" | "mercadopago_webhook" | "admin_direct") => {
    setSource(newSource);
    const range = preset === "custom" && customFrom && customTo
      ? { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString(), granularity: "day" as const }
      : getDateRangeForPreset(preset);

    loadMetrics({
      from: range.from,
      to: range.to,
      granularity: range.granularity,
      source: newSource,
    });
  };

  const handleApplyCustomRange = () => {
    if (!customFrom || !customTo) return;
    const fromIso = new Date(customFrom).toISOString();
    const toIso = new Date(customTo).toISOString();
    loadMetrics({
      from: fromIso,
      to: toIso,
      granularity: "day",
      source,
    });
  };

  const loadMetrics = (params: {
    from: string;
    to: string;
    granularity: "hour" | "day" | "week" | "month";
    source: "all" | "mercadopago_webhook" | "admin_direct";
  }) => {
    startTransition(async () => {
      try {
        const result = await fetchDashboardAnalytics({
          tenantId,
          from: params.from,
          to: params.to,
          granularity: params.granularity,
          source: params.source,
        });
        setData(result);
      } catch (err) {
        console.error("Failed to refresh analytics:", err);
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Controls Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 font-semibold text-zinc-400">Período:</span>
          {(
            [
              { id: "today", label: "Hoy" },
              { id: "7d", label: "Últimos 7 días" },
              { id: "30d", label: "Últimos 30 días" },
              { id: "month", label: "Este mes" },
              { id: "custom", label: "Personalizado" },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePresetChange(p.id)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                preset === p.id
                  ? "bg-amber-400 text-zinc-950 shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Source and refresh */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Canal:</span>
            <select
              value={source}
              onChange={(e) =>
                handleSourceChange(
                  e.target.value as "all" | "mercadopago_webhook" | "admin_direct",
                )
              }
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-400"
            >
              <option value="all">Todos los canales</option>
              <option value="mercadopago_webhook">Mercado Pago (Online)</option>
              <option value="admin_direct">Mostrador / Caja</option>
            </select>
          </div>

          <button
            type="button"
            disabled={isPending}
            onClick={() => handlePresetChange(preset)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {isPending ? "Actualizando..." : "↻ Refrescar"}
          </button>
        </div>
      </div>

      {/* Custom Date Picker Inputs (if custom selected) */}
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Desde:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-zinc-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Hasta:</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-zinc-200"
            />
          </div>
          <button
            type="button"
            onClick={handleApplyCustomRange}
            className="rounded bg-amber-400 px-3 py-1 font-semibold text-zinc-950 hover:bg-amber-300"
          >
            Aplicar Rango
          </button>
        </div>
      )}

      {/* Loading overlay indicator */}
      {isPending && (
        <div className="text-center text-xs text-amber-400">
          Cargando datos analíticos actualizados...
        </div>
      )}

      {/* KPI Cards */}
      <KpiCards data={data} />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RevenueTimelineChart data={data} />
        <DwellTimeChart data={data} />
      </div>

      {/* Bottom Grid: Top Products & Financial Details */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopProductsPanel data={data} />
        <FinancialSummaryPanel data={data} />
      </div>
    </div>
  );
}
