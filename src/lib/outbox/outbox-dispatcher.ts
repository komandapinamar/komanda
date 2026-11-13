import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { emitMetric } from "@/lib/observability/metrics";
import { eventTypeFilter } from "@/lib/outbox/outbox-event-types";
import { OUTBOX_DISPATCH_SERVICE_ID } from "@/lib/outbox/outbox-service-ids";
import { withPlatformServiceTransaction } from "@/db/tenant-transaction";

export type ClaimedOutboxEvent = {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  sequence: string;
  attempts: number;
};

export type OutboxConsumer = (event: ClaimedOutboxEvent) => Promise<void>;

type DispatcherOptions = {
  workerId?: string;
  batchSize?: number;
  leaseMs?: number;
  maxAttempts?: number;
  consumers: Record<string, OutboxConsumer>;
  /**
   * Tipos de evento que este dispatcher puede reclamar. Sin esta lista el
   * dispatcher reclama cualquier evento y falla al no encontrar consumidor.
   * Cuando la lista esta vacia no se reclama nada: un dispatcher sin
   * consumidores no debe girar ni tocar la outbox.
   */
  eventTypes?: readonly string[];
};

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_ATTEMPTS = 5;

function backoffMs(attempts: number) {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
  return base + Math.floor(Math.random() * Math.max(250, base * 0.25));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2_000) : "Unknown outbox consumer error.";
}

export class OutboxDispatcher {
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly consumers: Record<string, OutboxConsumer>;
  private readonly eventTypes?: readonly string[];

  constructor(options: DispatcherOptions) {
    this.workerId = options.workerId ?? `outbox-${randomUUID()}`;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.consumers = options.consumers;
    this.eventTypes = options.eventTypes;
  }

  async dispatchOnce() {
    const events = await this.claimBatch();
    let succeeded = 0;
    let failed = 0;

    for (const event of events) {
      const started = performance.now();
      try {
        const consumer = this.consumers[event.eventType];
        if (!consumer) throw new Error(`No consumer registered for ${event.eventType}.`);
        await consumer(event);
        await this.markPublished(event.id);
        succeeded += 1;
        emitMetric("outbox.dispatched", {
          tenantId: event.tenantId,
          result: "ok",
          latencyMs: Math.round(performance.now() - started),
          tags: { eventType: event.eventType },
        });
      } catch (error) {
        failed += 1;
        await this.markFailed(event, errorMessage(error));
        emitMetric("outbox.failed", {
          tenantId: event.tenantId,
          result: "failed",
          latencyMs: Math.round(performance.now() - started),
          tags: { eventType: event.eventType },
        });
      }
    }

    return { claimed: events.length, succeeded, failed };
  }

  private async claimBatch() {
    // Un dispatcher sin consumidores (o sin tipos de evento) no debe tocar la
    // outbox: reclamaria eventos que no puede publicar y los quemaria contra
    // el dead-letter.
    if (this.eventTypes && this.eventTypes.length === 0) {
      return [];
    }
    const leaseSeconds = Math.max(1, Math.ceil(this.leaseMs / 1_000));
    // El barrido es cross-tenant: el dispatcher recorre la outbox de todos los
    // tenants. Bajo RLS eso solo es posible con el service_id de plataforma
    // (politica outbox_events_platform_dispatch).
    const result = await withPlatformServiceTransaction(
      { serviceId: OUTBOX_DISPATCH_SERVICE_ID, correlationId: this.workerId },
      (transaction) =>
        transaction.execute<ClaimedOutboxEvent>(sql`
      with candidates as (
        select id
        from outbox_events
        where published_at is null
          and dead_letter_at is null
          and available_at <= now()
          and (leased_until is null or leased_until < now())
          ${this.eventTypes ? sql`and ${eventTypeFilter(this.eventTypes)}` : sql``}
        order by sequence asc
        limit ${this.batchSize}
        for update skip locked
      )
      update outbox_events as event
      set claimed_by = ${this.workerId},
          leased_until = now() + make_interval(secs => ${leaseSeconds}),
          attempts = event.attempts + 1
      from candidates
      where event.id = candidates.id
      returning event.id, event.tenant_id as "tenantId", event.aggregate_type as "aggregateType",
        event.aggregate_id as "aggregateId", event.event_type as "eventType", event.payload,
        event.sequence::text as sequence, event.attempts
    `),
    );
    emitMetric("outbox.claimed", { count: result.rows.length, tags: { workerId: this.workerId } });
    return result.rows;
  }

  private async markPublished(id: string) {
    await withPlatformServiceTransaction(
      { serviceId: OUTBOX_DISPATCH_SERVICE_ID, correlationId: this.workerId },
      (transaction) =>
        transaction.execute(sql`
      update outbox_events
      set published_at = now(), claimed_by = null, leased_until = null, last_error = null
      where id = ${id}::uuid and claimed_by = ${this.workerId}
    `),
    );
  }

  private async markFailed(event: ClaimedOutboxEvent, message: string) {
    const deadLetter = event.attempts >= this.maxAttempts;
    const retryMs = backoffMs(event.attempts);
    await withPlatformServiceTransaction(
      { serviceId: OUTBOX_DISPATCH_SERVICE_ID, correlationId: this.workerId },
      (transaction) =>
        transaction.execute(sql`
      update outbox_events
      set available_at = case when ${deadLetter} then available_at else now() + make_interval(msecs => ${retryMs}) end,
          claimed_by = null,
          leased_until = null,
          last_error = ${message},
          dead_letter_at = case when ${deadLetter} then now() else dead_letter_at end
      where id = ${event.id}::uuid and claimed_by = ${this.workerId}
    `),
    );
    emitMetric(deadLetter ? "outbox.dead_lettered" : "outbox.retry_scheduled", {
      tenantId: event.tenantId,
      result: "failed",
      tags: { eventType: event.eventType, attempts: String(event.attempts) },
    });
  }
}
