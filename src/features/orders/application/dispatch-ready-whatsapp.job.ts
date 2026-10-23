import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { tenantOrders, tenants } from "@/db/schema";
import { withPlatformServiceTransaction, withTenantIdTransaction } from "@/db/tenant-transaction";
import { normalizeWhatsAppRecipient } from "@/features/orders/domain/whatsapp-consent";
import { sendReadyWhatsApp } from "@/features/orders/infrastructure/whatsapp.client";

type Claimed = { id: string; order_id: string; attempts: number };

export async function dispatchReadyWhatsApp(batchSize = 25) {
  const workerId = `whatsapp-${randomUUID()}`;
  const tenantIds = await withPlatformServiceTransaction(
    { serviceId: "whatsapp_dispatch", correlationId: randomUUID() },
    async transaction => transaction.select({ id: tenants.id }).from(tenants),
  );
  let sent = 0;
  let failed = 0;
  let remaining = Math.max(1, Math.min(100, batchSize));

  for (const { id: tenantId } of tenantIds) {
    while (remaining > 0) {
      const event = await withTenantIdTransaction(tenantId, async transaction => {
        const claimed = await transaction.execute<Claimed>(sql`
          with candidate as (
            select id from outbox_events
            where tenant_id = ${tenantId}::uuid and event_type = 'order.whatsapp_ready'
              and published_at is null and dead_letter_at is null and available_at <= now()
              and (leased_until is null or leased_until < now())
            order by sequence limit 1 for update skip locked
          )
          update outbox_events as event
          set claimed_by = ${workerId}, leased_until = now() + interval '60 seconds', attempts = event.attempts + 1
          from candidate where event.id = candidate.id
          returning event.id, event.aggregate_id as order_id, event.attempts
        `);
        return claimed.rows[0];
      });
      if (!event) break;
      remaining--;

      try {
        const order = await withTenantIdTransaction(tenantId, async transaction => {
          const [row] = await transaction.select({
            purchaseNumber: tenantOrders.purchaseNumber,
            fulfillmentStatus: tenantOrders.fulfillmentStatus,
            paymentStatus: tenantOrders.paymentStatus,
            customer: tenantOrders.customerSnapshot,
          }).from(tenantOrders).where(and(
            eq(tenantOrders.tenantId, tenantId), eq(tenantOrders.id, event.order_id),
          )).limit(1);
          return row;
        });
        const customer = order?.customer as Record<string, unknown> | undefined;
        const phone = customer?.whatsappReadyOptIn === true && typeof customer.phone === "string"
          ? normalizeWhatsAppRecipient(customer.phone) : null;
        if (order && phone && order.paymentStatus === "paid" && order.fulfillmentStatus !== "cancelled") {
          await sendReadyWhatsApp(phone, String(order.purchaseNumber));
        }
        await withTenantIdTransaction(tenantId, async transaction => {
          await transaction.execute(sql`
            update outbox_events set published_at = now(), claimed_by = null, leased_until = null, last_error = null
            where id = ${event.id}::uuid and claimed_by = ${workerId}
          `);
        });
        sent++;
      } catch {
        await withTenantIdTransaction(tenantId, async transaction => {
          await transaction.execute(sql`
            update outbox_events
            set claimed_by = null, leased_until = null,
                available_at = now() + interval '5 minutes',
                last_error = 'WhatsApp delivery failed',
                dead_letter_at = case when attempts >= 5 then now() else dead_letter_at end
            where id = ${event.id}::uuid and claimed_by = ${workerId}
          `);
        });
        failed++;
      }
    }
    if (!remaining) break;
  }
  return { sent, failed };
}
