import "dotenv/config";

import { Pool } from "pg";

export type MaintenanceRetentionOptions = {
  storefrontEventsRetentionDays?: number;
  outboxEventsRetentionDays?: number;
  expiredSessionsRetentionDays?: number;
  printJobsRetentionDays?: number;
  abandonedCartsRetentionDays?: number;
  batchSize?: number;
  maxBatchesPerTable?: number;
  sleepBetweenBatchesMs?: number;
};

export type MaintenanceResult = {
  storefrontEventsPruned: number;
  outboxEventsPruned: number;
  idempotencyRecordsPruned: number;
  userSessionsPruned: number;
  printJobAttemptsPruned: number;
  printJobsPruned: number;
  abandonedCartLinesPruned: number;
  abandonedCartsPruned: number;
  truncatedTables: string[];
};

export type RetentionClient = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rowCount: number | null }>;
};

export type BatchedDeleteInput = {
  table: string;
  predicate: string;
  params?: unknown[];
  batchSize: number;
  maxBatches: number;
  sleepMs: number;
};

// Deletes in small batches so a maintenance run never holds long locks or spikes
// I/O on the transactional database. Stops early when a batch is not full;
// reports `truncated` when it hit the per-run ceiling (work continues in the
// next scheduled run).
export async function runBatchedDelete(
  client: RetentionClient,
  input: BatchedDeleteInput,
): Promise<{ deleted: number; truncated: boolean }> {
  const { table, predicate, params = [], batchSize, maxBatches, sleepMs } = input;
  const statement = `WITH batch AS (
       SELECT ctid FROM ${table}
       WHERE ${predicate}
       LIMIT $${params.length + 1}
     )
     DELETE FROM ${table} AS target
     USING batch
     WHERE target.ctid = batch.ctid`;

  let deleted = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const result = await client.query(statement, [...params, batchSize]);
    const count = result.rowCount ?? 0;
    deleted += count;
    batches += 1;

    if (count < batchSize) {
      return { deleted, truncated: false };
    }
    if (batches >= maxBatches) {
      break;
    }
    if (sleepMs > 0) {
      await client.query("SELECT pg_sleep($1)", [sleepMs / 1000]);
    }
  }

  return { deleted, truncated: true };
}

export async function runDatabaseMaintenanceRetention(
  connectionString?: string,
  options?: MaintenanceRetentionOptions,
): Promise<MaintenanceResult> {
  const url = connectionString ?? process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for maintenance.");
  }

  const cfg = {
    storefrontEventsRetentionDays: options?.storefrontEventsRetentionDays ?? 90,
    outboxEventsRetentionDays: options?.outboxEventsRetentionDays ?? 7,
    expiredSessionsRetentionDays: options?.expiredSessionsRetentionDays ?? 30,
    printJobsRetentionDays: options?.printJobsRetentionDays ?? 30,
    abandonedCartsRetentionDays: options?.abandonedCartsRetentionDays ?? 14,
    batchSize: options?.batchSize ?? 2000,
    maxBatchesPerTable: options?.maxBatchesPerTable ?? 25,
    sleepBetweenBatchesMs: options?.sleepBetweenBatchesMs ?? 150,
  };

  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const rc = client as unknown as RetentionClient;
  const truncatedTables: string[] = [];

  const batchConfig = {
    batchSize: cfg.batchSize,
    maxBatches: cfg.maxBatchesPerTable,
    sleepMs: cfg.sleepBetweenBatchesMs,
  };

  const prune = async (
    label: string,
    table: string,
    predicate: string,
    params: unknown[] = [],
  ) => {
    const result = await runBatchedDelete(rc, { table, predicate, params, ...batchConfig });
    if (result.truncated) truncatedTables.push(label);
    return result.deleted;
  };

  try {
    // Keep maintenance from blocking checkout: bounded waits and a per-statement
    // timeout so a single delete can never pin a lock or a connection forever.
    await rc.query("SET lock_timeout = '2s'");
    await rc.query("SET statement_timeout = '30s'");
    await rc.query("SET idle_in_transaction_session_timeout = '30s'");

    const storefrontEventsPruned = await prune(
      "storefront_item_events",
      "storefront_item_events",
      "occurred_at < now() - ($1 || ' days')::interval",
      [cfg.storefrontEventsRetentionDays],
    );

    const outboxEventsPruned = await prune(
      "outbox_events",
      "outbox_events",
      "published_at IS NOT NULL AND published_at < now() - ($1 || ' days')::interval",
      [cfg.outboxEventsRetentionDays],
    );

    const idempotencyRecordsPruned = await prune(
      "idempotency_records",
      "idempotency_records",
      "expires_at < now()",
    );

    const userSessionsPruned = await prune(
      "user_sessions",
      "user_sessions",
      "(expires_at < now() - ($1 || ' days')::interval) OR (revoked_at IS NOT NULL AND revoked_at < now() - ($1 || ' days')::interval)",
      [cfg.expiredSessionsRetentionDays],
    );

    // Terminal print jobs: prune child print_job_attempts first to preserve
    // foreign key restrict constraints.
    const printJobAttemptsPruned = await prune(
      "print_job_attempts",
      "print_job_attempts",
      `EXISTS (
         SELECT 1 FROM print_jobs j
         WHERE j.tenant_id = print_job_attempts.tenant_id
           AND j.id = print_job_attempts.print_job_id
           AND j.status IN ('printed', 'failed', 'cancelled')
           AND coalesce(j.updated_at, j.created_at) < now() - ($1 || ' days')::interval
       )`,
      [cfg.printJobsRetentionDays],
    );

    const printJobsPruned = await prune(
      "print_jobs",
      "print_jobs",
      `status IN ('printed', 'failed', 'cancelled')
         AND coalesce(updated_at, created_at) < now() - ($1 || ' days')::interval
         AND NOT EXISTS (
           SELECT 1 FROM print_job_attempts a
           WHERE a.tenant_id = print_jobs.tenant_id
             AND a.print_job_id = print_jobs.id
         )`,
      [cfg.printJobsRetentionDays],
    );

    // Abandoned carts: only those with no order and no payment attempt, deleted
    // children-first so the restrict foreign keys are never violated. Carts whose
    // children were not fully pruned in this run wait for the next one.
    const cartEligibility = `c.status IN ('open', 'expired')
         AND c.expires_at < now() - ($1 || ' days')::interval
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.tenant_id = c.tenant_id AND o.cart_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM payment_attempts p WHERE p.tenant_id = c.tenant_id AND p.cart_id = c.id)`;

    await prune(
      "cart_line_options",
      "cart_line_options",
      `EXISTS (
         SELECT 1 FROM cart_lines l
         JOIN carts c ON c.tenant_id = l.tenant_id AND c.id = l.cart_id
         WHERE l.tenant_id = cart_line_options.tenant_id
           AND l.id = cart_line_options.cart_line_id
           AND ${cartEligibility}
       )`,
      [cfg.abandonedCartsRetentionDays],
    );

    const abandonedCartLinesPruned = await prune(
      "cart_lines",
      "cart_lines",
      `EXISTS (
         SELECT 1 FROM carts c
         WHERE c.tenant_id = cart_lines.tenant_id
           AND c.id = cart_lines.cart_id
           AND ${cartEligibility}
       )
       AND NOT EXISTS (
         SELECT 1 FROM cart_line_options o
         WHERE o.tenant_id = cart_lines.tenant_id AND o.cart_line_id = cart_lines.id
       )`,
      [cfg.abandonedCartsRetentionDays],
    );

    const abandonedCartsPruned = await prune(
      "carts",
      "carts",
      `carts.status IN ('open', 'expired')
         AND carts.expires_at < now() - ($1 || ' days')::interval
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.tenant_id = carts.tenant_id AND o.cart_id = carts.id)
         AND NOT EXISTS (SELECT 1 FROM payment_attempts p WHERE p.tenant_id = carts.tenant_id AND p.cart_id = carts.id)
         AND NOT EXISTS (SELECT 1 FROM cart_lines l WHERE l.tenant_id = carts.tenant_id AND l.cart_id = carts.id)`,
      [cfg.abandonedCartsRetentionDays],
    );

    return {
      storefrontEventsPruned,
      outboxEventsPruned,
      idempotencyRecordsPruned,
      userSessionsPruned,
      printJobAttemptsPruned,
      printJobsPruned,
      abandonedCartLinesPruned,
      abandonedCartsPruned,
      truncatedTables,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const result = await runDatabaseMaintenanceRetention();
  console.log("Database maintenance retention finished successfully:");
  console.log(JSON.stringify(result, null, 2));
  if (result.truncatedTables.length > 0) {
    console.log(
      `Note: ${result.truncatedTables.join(", ")} hit the per-run batch ceiling; the next run continues.`,
    );
  }
}

if (process.argv[1] && process.argv[1].endsWith("database-maintenance-retention.ts")) {
  main().catch((err) => {
    console.error("Maintenance retention failed:", err);
    process.exit(1);
  });
}
