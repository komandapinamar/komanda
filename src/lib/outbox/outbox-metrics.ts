import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function readOutboxMetrics() {
  const result = await db.execute<{
    pending_count: string;
    dead_letter_count: string;
    oldest_pending_seconds: string | null;
  }>(sql`
    select
      count(*) filter (where published_at is null and dead_letter_at is null) as pending_count,
      count(*) filter (where dead_letter_at is not null) as dead_letter_count,
      extract(epoch from (now() - min(created_at) filter (
        where published_at is null and dead_letter_at is null
      ))) as oldest_pending_seconds
    from outbox_events
  `);
  const row = result.rows[0];
  return {
    pendingCount: Number(row?.pending_count ?? 0),
    deadLetterCount: Number(row?.dead_letter_count ?? 0),
    oldestPendingSeconds: row?.oldest_pending_seconds
      ? Number(row.oldest_pending_seconds)
      : 0,
  };
}
