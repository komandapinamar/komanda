import { runtimePool } from "@/db";

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

export async function checkOutboxHealth() {
  return {
    name: "outbox" as const,
    status: "ok" as const,
    latencyMs: 0,
  };
}

export async function checkPrintingHealth() {
  return {
    name: "printing" as const,
    status: process.env.PRINTING_HEALTH_DISABLED === "true" ? "degraded" as const : "ok" as const,
    latencyMs: 0,
  };
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
