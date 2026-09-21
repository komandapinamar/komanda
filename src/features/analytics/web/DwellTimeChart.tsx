"use client";

import type { DashboardAnalyticsData } from "./analytics-types";

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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

function buildTicks(maxValue: number) {
  const targetSteps = 4;
  const safe = Math.max(maxValue, 30);
  const rawStep = safe / targetSteps;
  const niceSteps = [5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const step =
    niceSteps.find((candidate) => candidate >= rawStep) ??
    Math.ceil(rawStep / 3600) * 3600;
  const max = step * targetSteps;
  const ticks = Array.from({ length: targetSteps + 1 }, (_, index) => index * step);
  return { ticks, max };
}

export default function DwellTimeChart({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const items = data.dwellTimeline;
  const granularity = data.dateRange.granularity;

  if (items.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center text-zinc-400">
        <p className="text-sm">No hay datos de navegación en la carta para el rango seleccionado.</p>
      </div>
    );
  }

  const maxAvgDwell = Math.max(...items.map((item) => item.avgDwellSeconds));
  const { ticks, max } = buildTicks(maxAvgDwell);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Tiempo de Permanencia en Carta vs Compras
        </h2>
        <p className="text-xs text-zinc-400">
          Permanencia promedio por visitante y compras concretadas
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <div className="relative h-48 w-12 shrink-0" aria-hidden>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-zinc-500"
              style={{ bottom: `${(tick / max) * 100}%` }}
            >
              {formatDuration(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ minWidth: `${items.length * 44}px` }}>
            <div className="relative h-48">
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className="pointer-events-none absolute inset-x-0 border-t border-zinc-800"
                  style={{ bottom: `${(tick / max) * 100}%` }}
                />
              ))}

              <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-3">
                {items.map((item) => {
                  const heightPercent =
                    item.avgDwellSeconds <= 0
                      ? 0
                      : Math.max(2, (item.avgDwellSeconds / max) * 100);
                  return (
                    <div
                      key={item.bucket}
                      className="flex h-full min-w-[32px] flex-1 flex-col items-center justify-end"
                    >
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className="w-full max-w-[28px] rounded-t-md bg-amber-500/80 transition-colors hover:bg-(--color-accent-tertiary)"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex gap-1.5 sm:gap-3">
              {items.map((item) => (
                <span
                  key={item.bucket}
                  className="min-w-[32px] flex-1 truncate text-center text-[10px] text-zinc-400"
                >
                  {formatBucketLabel(item.bucket, granularity)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
