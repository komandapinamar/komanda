import os from "node:os";
import v8 from "node:v8";
import { performance } from "node:perf_hooks";
import { runtimePool } from "@/db";
import { emitMetric } from "@/lib/observability/metrics";
import { shutdownManager } from "@/lib/runtime/shutdown";

export type PressureLevel = "normal" | "elevated" | "critical";

export type PressureAction =
  | "none"
  | "shed_non_critical"
  | "activate_fallback";

export type PressureSignalName =
  | "event_loop_lag"
  | "cpu_utilization"
  | "heap_utilization"
  | "pg_pool_waiting"
  | "pg_pool_utilization"
  | "in_flight_requests"
  | "sse_connections";

export type PressureSignal = {
  name: PressureSignalName;
  value: number;
  unit: "ms" | "ratio" | "count";
  level: PressureLevel;
  elevatedAt: number;
  criticalAt: number;
};

export type PressureThresholds = Record<
  PressureSignalName,
  { elevated: number; critical: number }
>;

export type PressureSnapshot = {
  state: PressureLevel;
  recommendedAction: PressureAction;
  reasons: PressureSignalName[];
  signals: PressureSignal[];
  thresholds: PressureThresholds;
  sampledAt: string;
  uptimeSeconds: number;
};

export type PressureSources = {
  eventLoopLagMs: number;
  cpuUtilization: number;
  heapUtilization: number;
  poolWaiting: number;
  poolTotal: number;
  poolMax: number;
  inFlightRequests: number;
  sseConnections: number;
};

export const DEFAULT_PRESSURE_THRESHOLDS: PressureThresholds = {
  event_loop_lag: { elevated: 100, critical: 500 },
  cpu_utilization: { elevated: 0.75, critical: 0.9 },
  heap_utilization: { elevated: 0.8, critical: 0.92 },
  pg_pool_waiting: { elevated: 1, critical: 5 },
  pg_pool_utilization: { elevated: 0.8, critical: 0.95 },
  in_flight_requests: { elevated: 100, critical: 300 },
  sse_connections: { elevated: 150, critical: 400 },
};

const SIGNAL_METADATA: Record<
  PressureSignalName,
  { unit: PressureSignal["unit"]; envKey: string }
> = {
  event_loop_lag: { unit: "ms", envKey: "EVENT_LOOP_LAG_MS" },
  cpu_utilization: { unit: "ratio", envKey: "CPU_UTILIZATION" },
  heap_utilization: { unit: "ratio", envKey: "HEAP_UTILIZATION" },
  pg_pool_waiting: { unit: "count", envKey: "PG_POOL_WAITING" },
  pg_pool_utilization: { unit: "ratio", envKey: "PG_POOL_UTILIZATION" },
  in_flight_requests: { unit: "count", envKey: "IN_FLIGHT_REQUESTS" },
  sse_connections: { unit: "count", envKey: "SSE_CONNECTIONS" },
};

function positiveNumber(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function envNumber(env: NodeJS.ProcessEnv, key: string, fallback: number) {
  return positiveNumber(env[key], fallback);
}

export function pressureThresholdsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PressureThresholds {
  return Object.fromEntries(
    (
      Object.entries(DEFAULT_PRESSURE_THRESHOLDS) as Array<
        [PressureSignalName, { elevated: number; critical: number }]
      >
    ).map(([name, defaults]) => {
      const envKey = SIGNAL_METADATA[name].envKey;
      return [
        name,
        {
          elevated: envNumber(
            env,
            `PRESSURE_${envKey}_ELEVATED`,
            defaults.elevated,
          ),
          critical: envNumber(
            env,
            `PRESSURE_${envKey}_CRITICAL`,
            defaults.critical,
          ),
        },
      ];
    }),
  ) as PressureThresholds;
}

export function classifyPressure(
  value: number,
  thresholds: { elevated: number; critical: number },
): PressureLevel {
  if (value >= thresholds.critical) return "critical";
  if (value >= thresholds.elevated) return "elevated";
  return "normal";
}

function signal(
  name: PressureSignalName,
  value: number,
  thresholds: PressureThresholds,
): PressureSignal {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  const limit = thresholds[name];
  return {
    name,
    value: Math.round(normalized * 1000) / 1000,
    unit: SIGNAL_METADATA[name].unit,
    level: classifyPressure(normalized, limit),
    elevatedAt: limit.elevated,
    criticalAt: limit.critical,
  };
}

export function buildPressureSnapshot(
  sources: PressureSources,
  thresholds: PressureThresholds = DEFAULT_PRESSURE_THRESHOLDS,
  sampledAt: Date = new Date(),
): PressureSnapshot {
  const poolUtilization =
    sources.poolMax > 0 ? sources.poolTotal / sources.poolMax : 0;

  const signals = [
    signal("event_loop_lag", sources.eventLoopLagMs, thresholds),
    signal("cpu_utilization", sources.cpuUtilization, thresholds),
    signal("heap_utilization", sources.heapUtilization, thresholds),
    signal("pg_pool_waiting", sources.poolWaiting, thresholds),
    signal("pg_pool_utilization", poolUtilization, thresholds),
    signal("in_flight_requests", sources.inFlightRequests, thresholds),
    signal("sse_connections", sources.sseConnections, thresholds),
  ];

  const reasons = signals
    .filter((entry) => entry.level !== "normal")
    .map((entry) => entry.name);

  const state: PressureLevel = signals.some(
    (entry) => entry.level === "critical",
  )
    ? "critical"
    : reasons.length > 0
      ? "elevated"
      : "normal";

  const recommendedAction: PressureAction =
    state === "critical"
      ? "activate_fallback"
      : state === "elevated"
        ? "shed_non_critical"
        : "none";

  return {
    state,
    recommendedAction,
    reasons,
    signals,
    thresholds,
    sampledAt: sampledAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

const EVENT_LOOP_SAMPLE_INTERVAL_MS = 50;

let eventLoopTimer: NodeJS.Timeout | null = null;
let lastEventLoopTick = 0;
let eventLoopMaxLagMs = 0;
let eventLoopLagMs = 0;

function startEventLoopSampler() {
  if (eventLoopTimer || process.env.NODE_ENV === "test") return;
  lastEventLoopTick = performance.now();
  eventLoopTimer = setInterval(() => {
    const now = performance.now();
    const lag = Math.max(
      0,
      now - lastEventLoopTick - EVENT_LOOP_SAMPLE_INTERVAL_MS,
    );
    lastEventLoopTick = now;
    eventLoopMaxLagMs = Math.max(eventLoopMaxLagMs, lag);
  }, EVENT_LOOP_SAMPLE_INTERVAL_MS);
  eventLoopTimer.unref();
}

function readEventLoopLagMs() {
  startEventLoopSampler();
  if (eventLoopMaxLagMs > 0) {
    eventLoopLagMs = eventLoopMaxLagMs;
    eventLoopMaxLagMs = 0;
  }
  return eventLoopLagMs;
}

let lastCpuUsage = process.cpuUsage();
let lastCpuSampleAt = performance.now();
let cpuUtilization = 0;
let cpuCores = 1;

try {
  cpuCores =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : Math.max(1, os.cpus().length);
} catch {
  cpuCores = 1;
}

function readCpuUtilization() {
  const now = performance.now();
  const elapsedMs = now - lastCpuSampleAt;
  const usage = process.cpuUsage(lastCpuUsage);

  if (elapsedMs >= 1_000) {
    const elapsedMicros = elapsedMs * 1_000;
    const ratio =
      (usage.user + usage.system) / (elapsedMicros * Math.max(1, cpuCores));
    cpuUtilization = Math.max(0, Math.min(1, ratio));
    lastCpuUsage = process.cpuUsage();
    lastCpuSampleAt = now;
  }

  return cpuUtilization;
}

function readHeapUtilization() {
  const { heap_size_limit: heapSizeLimit } = v8.getHeapStatistics();
  if (!heapSizeLimit) return 0;
  return process.memoryUsage().heapUsed / heapSizeLimit;
}

const globalForPressure = globalThis as typeof globalThis & {
  __komandaPressureMonitor?: NodeJS.Timeout;
  __komandaPressureState?: PressureLevel | null;
};

export async function readPressureSnapshot(
  thresholds: PressureThresholds = pressureThresholdsFromEnv(),
): Promise<PressureSnapshot> {
  const poolMax = Number(
    runtimePool.options?.max ?? process.env.DATABASE_POOL_MAX ?? 10,
  );

  const sources: PressureSources = {
    eventLoopLagMs: readEventLoopLagMs(),
    cpuUtilization: readCpuUtilization(),
    heapUtilization: readHeapUtilization(),
    poolWaiting: Number(runtimePool.waitingCount ?? 0),
    poolTotal: Number(runtimePool.totalCount ?? 0),
    poolMax: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
    inFlightRequests: shutdownManager.getActiveRequestCount(),
    sseConnections: shutdownManager.getSseClientCount(),
  };

  return buildPressureSnapshot(sources, thresholds);
}

function metricTags(snapshot: PressureSnapshot) {
  const tags: Record<string, string> = {
    state: snapshot.state,
    action: snapshot.recommendedAction,
    reasons: snapshot.reasons.join(",") || "none",
  };

  for (const entry of snapshot.signals) {
    tags[entry.name] = String(entry.value);
  }

  return tags;
}

export function startPressureMonitor() {
  if (process.env.NODE_ENV === "test") return;
  if (globalForPressure.__komandaPressureMonitor) return;

  const intervalMs = Math.max(
    1_000,
    envNumber(process.env, "PRESSURE_SAMPLE_INTERVAL_MS", 15_000),
  );

  startEventLoopSampler();
  readCpuUtilization();

  const sample = async () => {
    try {
      const snapshot = await readPressureSnapshot();
      const previous = globalForPressure.__komandaPressureState ?? null;

      if (snapshot.state !== previous) {
        if (previous !== null || snapshot.state !== "normal") {
          emitMetric("pressure.state_changed", {
            result: snapshot.state === "normal" ? "ok" : "failed",
            latencyMs: Math.round(
              snapshot.signals.find((entry) => entry.name === "event_loop_lag")
                ?.value ?? 0,
            ),
            tags: {
              ...metricTags(snapshot),
              previous: previous ?? "unknown",
            },
          });
        }
        globalForPressure.__komandaPressureState = snapshot.state;
      }

      if (snapshot.state !== "normal") {
        emitMetric("pressure.snapshot", {
          result: "failed",
          latencyMs: Math.round(
            snapshot.signals.find((entry) => entry.name === "event_loop_lag")
              ?.value ?? 0,
          ),
          count: snapshot.reasons.length,
          tags: metricTags(snapshot),
        });
      }
    } catch (error) {
      emitMetric("pressure.sample_failed", {
        result: "failed",
        tags: {
          message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
        },
      });
    }
  };

  const timer = setInterval(() => void sample(), intervalMs);
  timer.unref();
  globalForPressure.__komandaPressureMonitor = timer;
  void sample();
}

export function stopPressureMonitor() {
  const timer = globalForPressure.__komandaPressureMonitor;
  if (timer) {
    clearInterval(timer);
    globalForPressure.__komandaPressureMonitor = undefined;
  }
  if (eventLoopTimer) {
    clearInterval(eventLoopTimer);
    eventLoopTimer = null;
  }
}
