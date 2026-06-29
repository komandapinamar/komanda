import "server-only";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_DIRECT_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL or DATABASE_DIRECT_URL environment variable.");
}

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const globalForDb = globalThis as typeof globalThis & {
  __komandaDbPool?: Pool;
};

// singleton pattern for the database connection
const pool = globalForDb.__komandaDbPool ?? new Pool({ connectionString: databaseUrl });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__komandaDbPool = pool;
}

export const db = drizzle(pool, { schema });
