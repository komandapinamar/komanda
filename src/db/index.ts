import "server-only";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Missing DATABASE_URL. Runtime code must never fall back to the migration-owner connection.",
  );
}

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const globalForDb = globalThis as typeof globalThis & {
  __komandaDbPool?: Pool;
};

// singleton pattern for the database connection
export const runtimePool =
  globalForDb.__komandaDbPool ?? new Pool({ connectionString: databaseUrl });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__komandaDbPool = runtimePool;
}

export const db = drizzle(runtimePool, { schema });
