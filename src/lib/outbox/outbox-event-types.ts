/**
 * Catálogo de tipos de evento de la outbox y su política de consumo.
 *
 * La outbox es append-only y compartida por todos los tenants. Cada tipo de
 * evento tiene exactamente un dueño del consumo, y ese dueño decide quién lo
 * reclama:
 *
 * - `CONSUMED_OUTBOX_EVENT_TYPES`: los reclama el dispatcher de outbox
 *   (`workers/outbox`). Son consumidores idempotentes que aplican un efecto
 *   sobre el dominio.
 * - `DEDICATED_JOB_OUTBOX_EVENT_TYPES`: los atiende un job dedicado con su
 *   propia consulta de claim (por ejemplo el dispatch de WhatsApp). El
 *   dispatcher general no debe reclamarlos o el efecto se duplica.
 * - Cualquier otro tipo queda pendiente hasta que exista su consumidor. Ese
 *   backlog se reporta aparte para no confundir "nadie lo consume todavia" con
 *   "el worker esta detenido".
 *
 * La lista es la fuente de verdad y `workers/outbox/consumer-registry` debe
 * coincidir con ella. Hay un test de arquitectura que lo verifica.
 */
import { sql } from "drizzle-orm";

export const OUTBOX_EVENT_TYPES = {
  ORDER_CREATED: "order.created",
  ORDER_PAID: "order.paid",
  ORDER_REFUNDED: "order.refunded",
  ORDER_TRANSITIONED: "order.transitioned",
  ORDER_WHATSAPP_READY: "order.whatsapp_ready",
  ORDER_WHATSAPP_OWNER_CASH_PENDING: "order.whatsapp_owner_cash_pending",
  PRINT_INTENT_CREATED: "print.intent.created",
  TENANT_PROVISIONED: "tenant.provisioned",
  MERCADOPAGO_PAYMENT_UPDATED: "mercadopago.payment.updated",
} as const;

export type OutboxEventType =
  (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES];

/** Tipos que el dispatcher de outbox puede reclamar. */
export const CONSUMED_OUTBOX_EVENT_TYPES: readonly string[] = [
  OUTBOX_EVENT_TYPES.PRINT_INTENT_CREATED,
];

/** Tipos atendidos por jobs dedicados. El dispatcher general no los reclama. */
export const DEDICATED_JOB_OUTBOX_EVENT_TYPES: readonly string[] = [
  OUTBOX_EVENT_TYPES.ORDER_WHATSAPP_READY,
  OUTBOX_EVENT_TYPES.ORDER_WHATSAPP_OWNER_CASH_PENDING,
];

/**
 * Filtro SQL parametrizado sobre `event_type`.
 *
 * Los tipos se pasan como parametros sueltos y no como un array: el array
 * PostgreSQL no viaja bien como parametro de array en esta capa y falla al
 * castear. Con lista vacia devuelve un predicado falso en vez de `in ()`,
 * que seria un error de sintaxis.
 */
export function eventTypeFilter(types: readonly string[]) {
  if (types.length === 0) {
    return sql`false`;
  }
  return sql`event_type in (${sql.join(
    types.map((type) => sql`${type}`),
    sql`, `,
  )})`;
}
