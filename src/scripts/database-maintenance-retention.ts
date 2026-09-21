import "dotenv/config";

import { Pool } from "pg";

export type MaintenanceRetentionOptions = {
  storefrontEventsRetentionDays?: number;
  outboxEventsRetentionDays?: number;
  expiredSessionsRetentionDays?: number;
};

export type MaintenanceResult = {
  storefrontEventsPruned: number;
  outboxEventsPruned: number;
  idempotencyRecordsPruned: number;
  userSessionsPruned: number;
};

export async function runDatabaseMaintenanceRetention(
  connectionString?: string,
  options?: MaintenanceRetentionOptions,
): Promise<MaintenanceResult> {
  const url = connectionString ?? process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for maintenance.");
  }

  const storefrontDays = options?.storefrontEventsRetentionDays ?? 90;
  const outboxDays = options?.outboxEventsRetentionDays ?? 7;
  const sessionDays = options?.expiredSessionsRetentionDays ?? 30;

  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  try {
    // 1. Prune stale storefront item events
    const storefrontResult = await client.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM storefront_item_events
         WHERE occurred_at < NOW() - ($1 || ' days')::interval
         RETURNING id
       ) SELECT count(*)::text AS count FROM deleted`,
      [storefrontDays],
    );

    // 2. Prune processed outbox events
    const outboxResult = await client.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM outbox_events
         WHERE published_at IS NOT NULL
           AND published_at < NOW() - ($1 || ' days')::interval
         RETURNING id
       ) SELECT count(*)::text AS count FROM deleted`,
      [outboxDays],
    );

    // 3. Prune expired idempotency records
    const idempotencyResult = await client.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM idempotency_records
         WHERE expires_at < NOW()
         RETURNING id
       ) SELECT count(*)::text AS count FROM deleted`,
    );

    // 4. Prune expired or revoked user sessions
    const sessionsResult = await client.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM user_sessions
         WHERE (expires_at < NOW() - ($1 || ' days')::interval)
            OR (revoked_at IS NOT NULL AND revoked_at < NOW() - ($1 || ' days')::interval)
         RETURNING id
       ) SELECT count(*)::text AS count FROM deleted`,
      [sessionDays],
    );

    return {
      storefrontEventsPruned: Number(storefrontResult.rows[0]?.count ?? 0),
      outboxEventsPruned: Number(outboxResult.rows[0]?.count ?? 0),
      idempotencyRecordsPruned: Number(idempotencyResult.rows[0]?.count ?? 0),
      userSessionsPruned: Number(sessionsResult.rows[0]?.count ?? 0),
    };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const result = await runDatabaseMaintenanceRetention();
  console.log("Database maintenance retention finished successfully:");
  console.log(`- Storefront item events pruned: ${result.storefrontEventsPruned}`);
  console.log(`- Outbox events pruned: ${result.outboxEventsPruned}`);
  console.log(`- Idempotency records pruned: ${result.idempotencyRecordsPruned}`);
  console.log(`- User sessions pruned: ${result.userSessionsPruned}`);
}

if (process.argv[1] && process.argv[1].endsWith("database-maintenance-retention.ts")) {
  main().catch((err) => {
    console.error("Maintenance retention failed:", err);
    process.exit(1);
  });
}
