import { runtimePool } from "@/db";
import { readOutboxMetrics } from "@/lib/outbox/outbox-metrics";

export type HealthCheckName =
  | "database"
  | "object_storage"
  | "mercadopago"
  | "outbox"
  | "printing";

export type HealthCheckResult = {
  name: HealthCheckName;
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  detail?: string;
};

async function measured(
  name: HealthCheckName,
  check: () => Promise<void>,
): Promise<HealthCheckResult> {
  const started = performance.now();
  try {
    await check();
    return { name, status: "ok", latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      name,
      status: "down",
      latencyMs: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function checkDatabaseHealth() {
  return measured("database", async () => {
    await runtimePool.query("select 1");
  });
}

export async function checkObjectStorageHealth() {
  return {
    name: "object_storage" as const,
    status: process.env.OBJECT_STORAGE_BUCKET ? "ok" as const : "degraded" as const,
    latencyMs: 0,
    detail: process.env.OBJECT_STORAGE_BUCKET ? undefined : "OBJECT_STORAGE_BUCKET not configured",
  };
}

export async function checkMercadoPagoHealth() {
  return {
    name: "mercadopago" as const,
    status: process.env.MERCADOPAGO_CLIENT_ID ? "ok" as const : "degraded" as const,
    latencyMs: 0,
    detail: process.env.MERCADOPAGO_CLIENT_ID ? undefined : "MERCADOPAGO_CLIENT_ID not configured",
  };
}

export async function checkOutboxHealth(): Promise<HealthCheckResult> {
  const started = performance.now();
  try {
    const metrics = await readOutboxMetrics();
    const latencyMs = Math.round(performance.now() - started);
    if (metrics.deadLetterCount > 50 || metrics.oldestPendingSeconds > 300) {
      return {
        name: "outbox",
        status: "degraded",
        latencyMs,
        detail: `Outbox backlog: ${metrics.pendingCount} pending, oldest ${Math.round(metrics.oldestPendingSeconds)}s, ${metrics.deadLetterCount} in DLQ`,
      };
    }
    return { name: "outbox", status: "ok", latencyMs };
  } catch (error) {
    return {
      name: "outbox",
      status: "down",
      latencyMs: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function checkPrintingHealth(): Promise<HealthCheckResult> {
  return measured("printing", async () => {
    await runtimePool.query("select 1 from print_jobs limit 1");
  });
}

export async function collectHealth() {
  const checks = await Promise.all([
    checkDatabaseHealth(),
    checkObjectStorageHealth(),
    checkMercadoPagoHealth(),
    checkOutboxHealth(),
    checkPrintingHealth(),
  ]);
  const status = checks.some((check) => check.status === "down")
    ? "down"
    : checks.some((check) => check.status === "degraded")
      ? "degraded"
      : "ok";
  return { status, checks, checkedAt: new Date().toISOString() };
}

import { shutdownManager } from "@/lib/runtime/shutdown";

export function collectLiveness() {
  return {
    status: "ok" as const,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

export async function collectReadiness() {
  if (shutdownManager.isTerminating()) {
    return {
      status: "down" as const,
      checks: [],
      detail: "Server is draining for shutdown",
      checkedAt: new Date().toISOString(),
    };
  }
  return collectHealth();
}
