"use client";

import { useState, useTransition } from "react";
import type { DashboardAnalyticsData, DatePreset } from "./analytics-types";
import { fetchDashboardAnalytics } from "./analytics-http";
import KpiCards from "./KpiCards";
import RevenueTimelineChart from "./RevenueTimelineChart";
import DwellTimeChart from "./DwellTimeChart";
import FinancialSummaryPanel from "./FinancialSummaryPanel";
import PeakHoursHeatmap from "./components/PeakHoursHeatmap";
import ProductsPerformanceGrid from "./components/ProductsPerformanceGrid";
import KitchenPerformancePanel from "./components/KitchenPerformancePanel";
import CustomerPromotionsPanel from "./components/CustomerPromotionsPanel";
import ExpressRetailPanel from "./components/ExpressRetailPanel";

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
  tenantPreset = "gastronomy",
}: {
  tenantId: string;
  initialData: DashboardAnalyticsData;
  tenantPreset?: "gastronomy" | "express_retail";
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
    <div className="font-[family-name:var(--font-instrument-sans)] space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1 rounded-2lg bg-background-full p-1 text-body-2-medium">
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
              className={`cursor-pointer rounded-md px-3 py-1.5 transition ${
                preset === p.id
                  ? "bg-segmented-control-selected-background text-text-primary shadow-2xs"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Source and refresh */}
        <div className="flex flex-wrap items-center gap-2 text-body-2-medium">
          <div className="flex items-center gap-1.5">
            <span className="text-text-secondary">Canal:</span>
            <select
              value={source}
              onChange={(e) =>
                handleSourceChange(
                  e.target.value as "all" | "mercadopago_webhook" | "admin_direct",
                )
              }
              className="h-8 rounded-lg border border-border-button-default bg-background-tertiary-default px-2.5 py-1 text-body-2-medium text-text-primary"
            >
              <option value="all">Todos los canales</option>
              <option value="mercadopago_webhook">Mercado Pago (Online)</option>
              <option value="admin_direct">Mostrador / Caja</option>
            </select>
          </div>

          <a
            href={`/api/v1/tenants/${tenantId}/analytics/export?from=${encodeURIComponent(data.dateRange.from)}&to=${encodeURIComponent(data.dateRange.to)}`}
            download
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border-button-default bg-background-primary-default px-3 text-body-2-medium text-text-primary shadow-xs transition hover:bg-background-primary-hover"
          >
            <span>Exportar CSV</span>
          </a>

          <button
            type="button"
            disabled={isPending}
            onClick={() => handlePresetChange(preset)}
            className="bg-button-primary button-press-motion inline-flex h-8 cursor-pointer items-center justify-center rounded-lg px-3.5 text-body-2-medium text-text-white shadow-xs disabled:opacity-50"
          >
            {isPending ? "Actualizando..." : "Refrescar"}
          </button>
        </div>
      </div>

      {/* Custom Date Picker Inputs (if custom selected) */}
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-4 text-body-2-medium shadow-card">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">Desde:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 text-body-2-regular"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">Hasta:</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-1.5 text-body-2-regular"
            />
          </div>
          <button
            type="button"
            onClick={handleApplyCustomRange}
            className="bg-button-primary button-press-motion inline-flex h-8 cursor-pointer items-center justify-center rounded-lg px-3.5 text-body-2-medium text-text-white shadow-xs"
          >
            Aplicar Rango
          </button>
        </div>
      )}

      {/* Loading overlay indicator */}
      {isPending && (
        <div className="text-center text-xs text-[#c2c2cc]">
          Cargando datos analíticos actualizados...
        </div>
      )}

      {/* KPI Cards */}
      <KpiCards data={data} />

      {/* Komanda Espresso Retail & Cash Shifts Panel (Express Retail Only) */}
      {tenantPreset === "express_retail" && <ExpressRetailPanel data={data} />}

      {/* Revenue and Dwell Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RevenueTimelineChart data={data} />
        <DwellTimeChart data={data} />
      </div>

      {/* Peak Demand Heatmap 24x7 */}
      <PeakHoursHeatmap data={data} />

      {/* Products Performance: Top Selling vs Viewed Without Sales */}
      <ProductsPerformanceGrid data={data} />

      {/* Kitchen Performance: Delays, Percentiles, and Pending Queue */}
      <KitchenPerformancePanel data={data} />

      {/* Financial Settlement & Cash Ledger */}
      <FinancialSummaryPanel data={data} />

      {/* Customer Recurrence & Promotions Panel */}
      <CustomerPromotionsPanel data={data} />
    </div>
  );
}
