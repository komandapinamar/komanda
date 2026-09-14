import "server-only";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Missing DATABASE_URL. Runtime code must never fall back to the migration-owner connection.",
  );
}

const globalForDb = globalThis as typeof globalThis & {
  __komandaDbPool?: Pool;
};

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("DATABASE_POOL_MAX must be a positive integer.");
  }
  return parsed;
}

// Keep one provider-neutral TCP pool per application process. Tenant context is
// always transaction-local; no authorization state is retained on a pooled
// connection between requests.
export const runtimePool =
  globalForDb.__komandaDbPool ??
  new Pool({
    connectionString: databaseUrl,
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 10),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__komandaDbPool = runtimePool;
}

export const db = drizzle(runtimePool, { schema });
