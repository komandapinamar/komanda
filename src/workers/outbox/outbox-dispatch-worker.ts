import { emitMetric } from "@/lib/observability/metrics";
import { OutboxDispatcher } from "@/lib/outbox/outbox-dispatcher";
import { readOutboxMetrics } from "@/lib/outbox/outbox-metrics";
import {
  OUTBOX_CONSUMED_EVENT_TYPES,
  OUTBOX_CONSUMERS,
} from "@/workers/outbox/consumer-registry";
import type { OutboxConsumer } from "@/lib/outbox/outbox-dispatcher";

export type OutboxDispatchOptions = {
  workerId?: string;
  batchSize?: number;
  leaseMs?: number;
  maxAttempts?: number;
  consumers?: Record<string, OutboxConsumer>;
};

export type OutboxDispatchResult = {
  claimed: number;
  succeeded: number;
  failed: number;
};

/**
 * Construye el dispatcher con el registro de consumidores real.
 *
 * `eventTypes` sale de las claves del registro: el dispatcher solo reclama
 * eventos que sabe aplicar.
 */
export function createOutboxDispatcher(options: OutboxDispatchOptions = {}) {
  const consumers = options.consumers ?? OUTBOX_CONSUMERS;
  return new OutboxDispatcher({
    workerId: options.workerId,
    batchSize: options.batchSize,
    leaseMs: options.leaseMs,
    maxAttempts: options.maxAttempts,
    consumers,
    eventTypes: Object.keys(consumers),
  });
}

/**
 * Ejecuta una ronda de despacho.
 *
 * Cuando no se reclama nada pero hay backlog reclamable, el problema no es el
 * trabajo: es que el dispatcher no puede ver los eventos (por ejemplo, si una
 * politica de RLS bloquea al rol de runtime). Sin este chequeo el worker
 * parece sano mientras la outbox se congela.
 */
export async function dispatchOutboxOnce(
  options: OutboxDispatchOptions = {},
): Promise<OutboxDispatchResult> {
  const dispatcher = createOutboxDispatcher(options);
  const result = await dispatcher.dispatchOnce();

  if (result.claimed === 0) {
    try {
      const metrics = await readOutboxMetrics(OUTBOX_CONSUMED_EVENT_TYPES);
      if (metrics.claimablePendingCount > 0) {
        emitMetric("outbox.claim_stalled", {
          count: metrics.claimablePendingCount,
          result: "failed",
          tags: {
            oldestClaimableSeconds: String(
              Math.round(metrics.oldestClaimablePendingSeconds),
            ),
          },
        });
        console.error(
          `[worker:outbox-dispatch] ${metrics.claimablePendingCount} claimable events are pending but none could be claimed. ` +
            "Revisar el rol de runtime, la visibilidad de la outbox y el lease.",
        );
      }
    } catch (error) {
      // El diagnostico no debe tumbar el despacho: si las metricas fallan, el
      // backlog igual se drena.
      console.error("[worker:outbox-dispatch] Could not read outbox metrics:", error);
    }
  }

  return result;
}
