"use client";

import { useState } from "react";
import type { DashboardAnalyticsData } from "./analytics-types";

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem > 0 ? `${rem}s` : ""}`;
}

function formatBucketLabel(bucketStr: string, granularity: string): string {
  try {
    const date = new Date(bucketStr);
    if (granularity === "hour") {
      return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  } catch {
    return bucketStr;
  }
}

export default function DwellTimeChart({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const items = data.dwellTimeline;
  const granularity = data.dateRange.granularity;

  if (items.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center text-zinc-400">
        <p className="text-sm">No hay datos de navegación en la carta para el rango seleccionado.</p>
      </div>
    );
  }

  const maxAvgDwell = Math.max(...items.map((i) => i.avgDwellSeconds), 30);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Tiempo de Permanencia en Carta vs Compras
          </h2>
          <p className="text-xs text-zinc-400">
            Permanencia promedio por visitante y compras concretadas
          </p>
        </div>
        {hoveredIndex !== null && items[hoveredIndex] && (
          <div className="text-xs text-amber-400 font-medium">
            {formatBucketLabel(items[hoveredIndex].bucket, granularity)}:{" "}
            <span className="font-bold">
              {formatSeconds(items[hoveredIndex].avgDwellSeconds)}
            </span>{" "}
            ({items[hoveredIndex].sessions} visitas, {items[hoveredIndex].orders} compras)
          </div>
        )}
      </div>

      <div className="mt-6 flex h-48 items-end gap-1.5 sm:gap-3 overflow-x-auto pb-2 pt-4">
        {items.map((item, idx) => {
          const dwell = item.avgDwellSeconds;
          const heightPercent = Math.max(8, (dwell / maxAvgDwell) * 100);
          const isHovered = hoveredIndex === idx;

          return (
            <div
              key={item.bucket}
              className="group relative flex flex-1 flex-col items-center justify-end h-full min-w-[32px] cursor-pointer"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Tooltip on hover */}
              {isHovered && (
                <div className="absolute -top-12 z-20 whitespace-nowrap rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-100 shadow-lg ring-1 ring-zinc-700">
                  <div className="font-semibold text-amber-400">
                    {formatSeconds(dwell)} promedio
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {item.sessions} visitas · {item.orders} compras
                  </div>
                </div>
              )}

              {/* Bar container */}
              <div className="w-full flex flex-col justify-end items-center h-[calc(100%-24px)]">
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full max-w-[28px] rounded-t-md transition-all ${
                    isHovered
                      ? "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                      : "bg-amber-500/80 hover:bg-amber-400"
                  }`}
                />
              </div>

              {/* Label */}
              <span className="mt-2 text-[10px] text-zinc-400 truncate max-w-full">
                {formatBucketLabel(item.bucket, granularity)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
