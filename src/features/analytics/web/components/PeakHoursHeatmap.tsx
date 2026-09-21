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
    <div className="font-[family-name:var(--font-instrument-sans)] rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-100">
              Horarios con Más Trabajo
            </h2>
            {heatmap?.busiestDay && (
              <span className="rounded-full bg-(--color-accent-tertiary)/10 px-2 py-0.5 text-[11px] font-medium text-(--color-accent-tertiary) border border-(--color-accent-tertiary)/20">
                Pico semanal: {heatmap.busiestDay}{" "}
                {heatmap.busiestHour !== null && heatmap.busiestHour !== undefined
                  ? `${String(heatmap.busiestHour).padStart(2, "0")}:00 hs`
                  : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400">
            Demanda observada por día y hora (matriz 24x7)
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center rounded-lg bg-zinc-800 p-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("matrix")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              viewMode === "matrix"
                ? "bg-(--color-accent-tertiary) text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Matriz 24x7
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              viewMode === "table"
                ? "bg-(--color-accent-tertiary) text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Ver datos como tabla
          </button>
        </div>
      </div>

      {cells.length === 0 ? (
        <div className="mt-6 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
          No hay registros de pedidos en el período seleccionado para calcular horarios.
        </div>
      ) : viewMode === "matrix" ? (
        <div className="mt-5 space-y-4">
          {/* Scrollable Matrix */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[760px]">
              {/* Hour Labels */}
              <div className="grid grid-cols-[80px_repeat(24,1fr)] gap-1 text-[10px] text-zinc-500 font-medium pb-1.5">
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
                      <span className="text-right pr-2 text-xs font-medium text-zinc-300 truncate">
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
                            className={`group relative flex h-7 items-center justify-center rounded text-[10px] transition-all duration-150 ${colorClass}`}
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
          <div className="flex flex-col gap-3 pt-2 border-t border-zinc-800 text-md sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-500 text-[11px]">Intensidad:</span>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span className="h-3 w-4 rounded bg-zinc-800/80 border border-zinc-700/40" />
                <span>0</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span className="h-3 w-4 rounded bg-amber-950/70" />
                <span>Bajo</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span className="h-3 w-4 rounded bg-amber-700" />
                <span>Medio</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span className="h-3 w-4 rounded bg-amber-500" />
                <span>Alto</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-950 font-bold">
                <span className="h-3 w-6 rounded bg-(--color-accent-tertiary) text-[8px] flex items-center justify-center">
                  Pico
                </span>
                <span className="text-(--color-accent-tertiary)">Máximo</span>
              </div>
            </div>

            {selectedCell ? (
              <div className="rounded-md bg-zinc-800/80 px-3 py-1.5 text-zinc-200 text-xs border border-zinc-700/60">
                <span className="font-semibold text-(--color-accent-tertiary)">
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
              <span className="text-zinc-500 text-[11px]">
                Tocá o pasá el cursor sobre una celda para ver el detalle de pedidos y ventas.
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Accessible Table View */
        <div className="mt-5 overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="sticky top-0 bg-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2 px-3">Día</th>
                <th className="py-2 px-3">Horario</th>
                <th className="py-2 px-3 text-right">Pedidos</th>
                <th className="py-2 px-3 text-right">Facturación</th>
                <th className="py-2 px-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {cells
                .filter((c) => c.orderCount > 0)
                .sort((a, b) => b.orderCount - a.orderCount)
                .map((cell) => (
                  <tr key={`${cell.dayOfWeek}-${cell.hour}`} className="hover:bg-zinc-800/40">
                    <td className="py-2 px-3 font-medium text-zinc-200">
                      {cell.dayName}
                    </td>
                    <td className="py-2 px-3 text-zinc-400">
                      {String(cell.hour).padStart(2, "0")}:00 -{" "}
                      {cell.hour === 23 ? "00" : String(cell.hour + 1).padStart(2, "0")}:00 hs
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-zinc-100">
                      {cell.orderCount}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-emerald-400">
                      {formatCurrency(cell.revenue)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {cell.isPeak ? (
                        <span className="rounded bg-(--color-accent-tertiary) px-1.5 py-0.5 text-[10px] font-bold text-zinc-950">
                          Pico
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[10px]">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              {cells.filter((c) => c.orderCount > 0).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-500">
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
