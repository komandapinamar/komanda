"use client";

import { useState } from "react";
import type { DashboardAnalyticsData } from "../analytics-types";
import type { PeakHoursHeatmapCell } from "../../domain/analytics.schemas";

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

function getCellColorClass(orderCount: number, maxOrders: number, isPeak: boolean): string {
  if (isPeak && orderCount > 0) {
    return "bg-(--color-accent-tertiary) text-zinc-950 font-bold shadow-sm shadow-(--color-accent-tertiary)/20";
  }
  if (orderCount === 0 || maxOrders === 0) {
    return "bg-zinc-800/60 text-zinc-600 hover:bg-zinc-800";
  }

  const ratio = orderCount / maxOrders;
  if (ratio > 0.7) {
    return "bg-amber-500 text-zinc-950 font-semibold";
  }
  if (ratio > 0.4) {
    return "bg-amber-700/90 text-amber-100 font-medium";
  }
  if (ratio > 0.15) {
    return "bg-amber-900/80 text-amber-200";
  }
  return "bg-amber-950/70 text-amber-300/80";
}

export default function PeakHoursHeatmap({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const [selectedCell, setSelectedCell] = useState<PeakHoursHeatmapCell | null>(null);
  const [viewMode, setViewMode] = useState<"matrix" | "table">("matrix");

  const heatmap = data.peakHoursHeatmap;
  const cells = heatmap?.cells ?? [];
  const maxOrders = heatmap?.maxOrdersInSlot ?? 0;

  const days = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Group cells by day of week (0 to 6)
  const cellsByDay: PeakHoursHeatmapCell[][] = Array.from({ length: 7 }, () => []);
  for (const cell of cells) {
    if (cell.dayOfWeek >= 0 && cell.dayOfWeek < 7) {
      cellsByDay[cell.dayOfWeek].push(cell);
    }
  }

  for (let d = 0; d < 7; d++) {
    cellsByDay[d].sort((a, b) => a.hour - b.hour);
  }

  return (
    <div className="font-[family-name:var(--font-instrument-sans)] liquid-glass-card rounded-3xl p-6 sm:p-7">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
              Horarios con Más Trabajo
            </h2>
            {heatmap?.busiestDay && (
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-[#f4f3f1]">
                Pico semanal: {heatmap.busiestDay}{" "}
                {heatmap.busiestHour !== null && heatmap.busiestHour !== undefined
                  ? `${String(heatmap.busiestHour).padStart(2, "0")}:00 hs`
                  : ""}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Demanda observada por día y hora (matriz 24x7)
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("matrix")}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${
              viewMode === "matrix"
                ? "bg-[#f4f3f1] text-[#141416]"
                : "border border-white/12 bg-white/[0.04] text-[#d4d4dc] hover:bg-white/[0.1] hover:text-white"
            }`}
          >
            Matriz 24x7
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${
              viewMode === "table"
                ? "bg-[#f4f3f1] text-[#141416]"
                : "border border-white/12 bg-white/[0.04] text-[#d4d4dc] hover:bg-white/[0.1] hover:text-white"
            }`}
          >
            Ver datos como tabla
          </button>
        </div>
      </div>

      {cells.length === 0 ? (
        <div className="mt-6 flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#101013]/90 text-center text-xs text-[#c2c2cc]">
          No hay registros de pedidos en el período seleccionado para calcular horarios.
        </div>
      ) : viewMode === "matrix" ? (
        <div className="mt-5 space-y-4">
          {/* Scrollable Matrix */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[760px]">
              {/* Hour Labels */}
              <div className="grid grid-cols-[80px_repeat(24,1fr)] gap-1 text-[10px] text-[#9b9ba4] font-medium pb-1.5">
                <span className="text-right pr-2">Día / Hs</span>
                {hours.map((h) => (
                  <span key={h} className="text-center">
                    {String(h).padStart(2, "0")}
                  </span>
                ))}
              </div>

              {/* Rows */}
              <div className="space-y-1">
                {days.map((dayName, dayIndex) => {
                  const dayCells = cellsByDay[dayIndex] || [];
                  return (
                    <div
                      key={dayName}
                      className="grid grid-cols-[80px_repeat(24,1fr)] items-center gap-1"
                    >
                      <span className="text-right pr-2 text-xs font-medium text-[#d4d4dc] truncate">
                        {dayName.slice(0, 3)}
                      </span>
                      {hours.map((hour) => {
                        const cell = dayCells[hour] ?? {
                          dayOfWeek: dayIndex,
                          dayName,
                          hour,
                          orderCount: 0,
                          revenue: "0.00",
                          isPeak: false,
                        };
                        const colorClass = getCellColorClass(
                          cell.orderCount,
                          maxOrders,
                          cell.isPeak,
                        );

                        return (
                          <button
                            key={hour}
                            type="button"
                            onClick={() => setSelectedCell(cell)}
                            title={`${dayName} ${String(hour).padStart(2, "0")}:00 hs — ${cell.orderCount} pedidos — ${formatCurrency(cell.revenue)}${cell.isPeak ? " (Pico)" : ""}`}
                            className={`group relative flex h-7 items-center justify-center rounded-lg text-[10px] transition-all duration-150 ${colorClass}`}
                          >
                            {cell.isPeak ? (
                              <span className="text-[9px] uppercase tracking-tighter">
                                Pico
                              </span>
                            ) : cell.orderCount > 0 ? (
                              <span>{cell.orderCount}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Legend and Selected Cell Detail */}
          <div className="flex flex-col gap-3 pt-3 border-t border-white/[0.08] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#9b9ba4] text-[11px]">Intensidad:</span>
              <div className="flex items-center gap-1 text-[10px] text-[#c2c2cc]">
                <span className="h-3 w-4 rounded bg-zinc-800/80 border border-white/10" />
                <span>0</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#c2c2cc]">
                <span className="h-3 w-4 rounded bg-amber-950/70" />
                <span>Bajo</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#c2c2cc]">
                <span className="h-3 w-4 rounded bg-amber-700" />
                <span>Medio</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#c2c2cc]">
                <span className="h-3 w-4 rounded bg-amber-500" />
                <span>Alto</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#141416] font-bold">
                <span className="h-3 w-6 rounded bg-[#f4f3f1] text-[8px] flex items-center justify-center">
                  Pico
                </span>
                <span className="text-[#f4f3f1] font-medium">Máximo</span>
              </div>
            </div>

            {selectedCell ? (
              <div className="rounded-full border border-white/12 bg-[#101013]/90 px-3.5 py-1.5 text-[#f4f3f1] text-xs">
                <span className="font-medium text-[#f4f3f1]">
                  {selectedCell.dayName} {String(selectedCell.hour).padStart(2, "0")}:00 hs:
                </span>{" "}
                {selectedCell.orderCount} pedido
                {selectedCell.orderCount === 1 ? "" : "s"} —{" "}
                <span className="font-medium text-emerald-400">
                  {formatCurrency(selectedCell.revenue)}
                </span>
                {selectedCell.isPeak ? " (Pico de demanda)" : ""}
              </div>
            ) : (
              <span className="text-[#9b9ba4] text-xs">
                Tocá o pasá el cursor sobre una celda para ver el detalle de pedidos y ventas.
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Accessible Table View */
        <div className="mt-5 overflow-x-auto max-h-80 rounded-2xl border border-white/12 bg-[#101013]/90">
          <table className="w-full text-left text-xs text-[#d4d4dc]">
            <thead className="sticky top-0 border-b border-white/[0.08] bg-[#141416] text-[#c2c2cc] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4 font-medium">Día</th>
                <th className="py-3 px-4 font-medium">Horario</th>
                <th className="py-3 px-4 text-right font-medium">Pedidos</th>
                <th className="py-3 px-4 text-right font-medium">Facturación</th>
                <th className="py-3 px-4 text-center font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {cells
                .filter((c) => c.orderCount > 0)
                .sort((a, b) => b.orderCount - a.orderCount)
                .map((cell) => (
                  <tr key={`${cell.dayOfWeek}-${cell.hour}`} className="hover:bg-white/[0.03]">
                    <td className="py-2.5 px-4 font-medium text-[#f4f3f1]">
                      {cell.dayName}
                    </td>
                    <td className="py-2.5 px-4 text-[#c2c2cc]">
                      {String(cell.hour).padStart(2, "0")}:00 -{" "}
                      {cell.hour === 23 ? "00" : String(cell.hour + 1).padStart(2, "0")}:00 hs
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-[#f4f3f1] tabular-nums">
                      {cell.orderCount}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-emerald-400 tabular-nums">
                      {formatCurrency(cell.revenue)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {cell.isPeak ? (
                        <span className="rounded-full bg-[#f4f3f1] px-2.5 py-0.5 text-[10px] font-medium text-[#141416]">
                          Pico
                        </span>
                      ) : (
                        <span className="text-[#9b9ba4] text-[10px]">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              {cells.filter((c) => c.orderCount > 0).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#c2c2cc]">
                    No hubo pedidos registrados en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
