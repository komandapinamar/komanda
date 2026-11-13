import "server-only";

import { withTenantTransaction } from "@/db/tenant-transaction";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { PrintJobService } from "@/features/printing/application/print-job.service";
import { emitMetric } from "@/lib/observability/metrics";
import type { ClaimedOutboxEvent } from "@/lib/outbox/outbox-dispatcher";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export type PrintIntentConsumerOptions = {
  /**
   * Ventana de curacion. Un evento viejo no es una comanda perdida: es una
   * orden que ya termino. Encolar el ticket de cocina de una orden de hace
   * meses imprimiria papel que nadie pidio.
   */
  maxAgeMs?: number;
};

const DEFAULT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function resolveMaxAgeMs() {
  const raw = Number.parseInt(process.env.PRINT_INTENT_MAX_AGE_MINUTES ?? "", 10);
  if (Number.isSafeInteger(raw) && raw > 0) {
    return raw * 60 * 1000;
  }
  return DEFAULT_MAX_AGE_MS;
}

/**
 * Consumidor de `print.intent.created`.
 *
 * El ticket de cocina hoy se encola dentro de la misma transaccion que crea
 * la orden, asi que la cola durable existe desde el commit. Este consumidor
 * es la red de seguridad: si una orden llego a existir sin su ticket (una
 * ruta de creacion que no encole, una reencolada manual, un job que fallo a
 * mitad de camino), el evento pendiente lo repara.
 *
 * Es idempotente: `PrintJobRepository.create` usa `onConflictDoNothing` sobre
 * la clave `order:{id}:kitchen-ticket`, de modo que reejecutarlo no duplica
 * la comanda ni reimprime.
 */
export async function ensureKitchenPrintJob(
  event: ClaimedOutboxEvent,
  options: PrintIntentConsumerOptions = {},
) {
  const orderId =
    typeof event.payload?.orderId === "string" ? event.payload.orderId : null;
  if (!orderId) {
    throw new Error(
      `print.intent.created ${event.id} does not carry an orderId in its payload.`,
    );
  }

  const maxAgeMs = options.maxAgeMs ?? resolveMaxAgeMs();
  const context = createVerifiedTenantContext({
    tenantId: event.tenantId,
    correlationId: `outbox:${event.id}`,
    source: "background",
    actor: { kind: "service", serviceId: "outbox:print-intent" },
  });

  await withTenantTransaction(context, async (transaction) => {
    const order = await new OrderRepository(transaction, context).findById(orderId);
    if (!order) {
      emitMetric("outbox.consumer_skipped", {
        tenantId: event.tenantId,
        result: "ignored",
        tags: { eventType: event.eventType, reason: "order_not_found" },
      });
      return;
    }
    if (
      order.fulfillmentStatus === "cancelled" ||
      order.fulfillmentStatus === "delivered"
    ) {
      emitMetric("outbox.consumer_skipped", {
        tenantId: event.tenantId,
        result: "ignored",
        tags: { eventType: event.eventType, reason: "order_finished" },
      });
      return;
    }
    if (Date.now() - new Date(order.createdAt).getTime() > maxAgeMs) {
      emitMetric("outbox.consumer_skipped", {
        tenantId: event.tenantId,
        result: "ignored",
        tags: { eventType: event.eventType, reason: "order_too_old" },
      });
      return;
    }

    const job = await new PrintJobService().enqueueOrderTicketInTransaction(
      transaction,
      context,
      order,
    );

    emitMetric("outbox.consumer_applied", {
      tenantId: event.tenantId,
      result: "ok",
      tags: {
        eventType: event.eventType,
        orderId,
        enqueued: job ? "true" : "false",
      },
    });
  });
}
