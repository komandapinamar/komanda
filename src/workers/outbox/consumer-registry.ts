import type { OutboxConsumer } from "@/lib/outbox/outbox-dispatcher";
import { OUTBOX_EVENT_TYPES } from "@/lib/outbox/outbox-event-types";
import { ensureKitchenPrintJob } from "@/workers/outbox/print-intent.consumer";

/**
 * Registro de consumidores del dispatcher de outbox.
 *
 * La clave de este mapa es la lista que el dispatcher puede reclamar. Debe
 * coincidir con `CONSUMED_OUTBOX_EVENT_TYPES`: si divergen, el dispatcher
 * reclama eventos sin consumidor (y los quema contra el dead-letter) o deja
 * eventos sin procesar. `tests/unit/outbox-consumer-registry.test.ts` lo
 * verifica.
 */
export const OUTBOX_CONSUMERS: Record<string, OutboxConsumer> = {
  [OUTBOX_EVENT_TYPES.PRINT_INTENT_CREATED]: ensureKitchenPrintJob,
};

/** Tipos que el dispatcher puede reclamar: exactamente los que tienen consumidor. */
export const OUTBOX_CONSUMED_EVENT_TYPES: readonly string[] =
  Object.keys(OUTBOX_CONSUMERS);
