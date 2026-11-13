import { sql } from "drizzle-orm";
import { withPlatformServiceTransaction } from "@/db/tenant-transaction";
import {
  CONSUMED_OUTBOX_EVENT_TYPES,
  eventTypeFilter,
} from "@/lib/outbox/outbox-event-types";
import { OUTBOX_METRICS_SERVICE_ID } from "@/lib/outbox/outbox-service-ids";

/**
 * Metricas de la outbox.
 *
 * El backlog se separa en dos porque el significado es distinto:
 *
 * - `claimablePendingCount`: eventos que el dispatcher de outbox puede
 *   reclamar. Si crece, el worker esta detenido o fallando.
 * - `unhandledPendingCount`: eventos sin consumidor registrado. No son un
 *   incidente del worker, son una funcionalidad todavia no construida, pero
 *   tienen que quedar visibles.
 *
 * El conteo es cross-tenant y por eso corre con service_id de plataforma
 * (politica outbox_events_platform_dispatch). Sin el, RLS devolveria cero
 * filas y el health check reportaria una cola vacia que no existe.
 */
export async function readOutboxMetrics(
  consumedEventTypes: readonly string[] = CONSUMED_OUTBOX_EVENT_TYPES,
) {
  const consumed = eventTypeFilter(consumedEventTypes);
  const result = await withPlatformServiceTransaction(
    { serviceId: OUTBOX_METRICS_SERVICE_ID, correlationId: "outbox:metrics" },
    (transaction) =>
      transaction.execute<{
        pending_count: string;
        claimable_count: string;
        unhandled_count: string;
        dead_letter_count: string;
        oldest_pending_seconds: string | null;
        oldest_claimable_seconds: string | null;
      }>(sql`
    select
      count(*) filter (where published_at is null and dead_letter_at is null) as pending_count,
      count(*) filter (
        where published_at is null and dead_letter_at is null and ${consumed}
      ) as claimable_count,
      count(*) filter (
        where published_at is null and dead_letter_at is null and not (${consumed})
      ) as unhandled_count,
      count(*) filter (where dead_letter_at is not null) as dead_letter_count,
      extract(epoch from (now() - min(created_at) filter (
        where published_at is null and dead_letter_at is null
      ))) as oldest_pending_seconds,
      extract(epoch from (now() - min(created_at) filter (
        where published_at is null and dead_letter_at is null and ${consumed}
      ))) as oldest_claimable_seconds
    from outbox_events
  `),
  );
  const row = result.rows[0];
  return {
    pendingCount: Number(row?.pending_count ?? 0),
    claimablePendingCount: Number(row?.claimable_count ?? 0),
    unhandledPendingCount: Number(row?.unhandled_count ?? 0),
    deadLetterCount: Number(row?.dead_letter_count ?? 0),
    oldestPendingSeconds: row?.oldest_pending_seconds
      ? Number(row.oldest_pending_seconds)
      : 0,
    oldestClaimablePendingSeconds: row?.oldest_claimable_seconds
      ? Number(row.oldest_claimable_seconds)
      : 0,
  };
}
