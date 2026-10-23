import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { orderLines, tenantOrders, tenants, tenantSettings } from "@/db/schema";
import { withPlatformServiceTransaction, withTenantIdTransaction } from "@/db/tenant-transaction";
import { normalizeWhatsAppRecipient } from "@/features/orders/domain/whatsapp-consent";
import { sendOwnerCashPendingWhatsApp } from "@/features/orders/infrastructure/whatsapp.client";

type Claimed = { id: string; order_id: string; attempts: number };

export async function dispatchOwnerCashWhatsApp(batchSize = 25) {
  const workerId = `owner-cash-whatsapp-${randomUUID()}`;
  const tenantIds = await withPlatformServiceTransaction({ serviceId: "whatsapp_dispatch", correlationId: randomUUID() },
    async transaction => transaction.select({ id: tenants.id }).from(tenants));
  const orderedTenantIds = [...tenantIds].sort((left, right) => left.id.localeCompare(right.id));
  const tenantOffset = orderedTenantIds.length
    ? (Math.floor(Date.now() / (5 * 60 * 1000)) * Math.max(1, Math.min(100, batchSize))) % orderedTenantIds.length
    : 0;
  const scheduledTenantIds = [
    ...orderedTenantIds.slice(tenantOffset),
    ...orderedTenantIds.slice(0, tenantOffset),
  ];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let remaining = Math.max(1, Math.min(100, batchSize));
  for (const { id: tenantId } of scheduledTenantIds) {
    while (remaining > 0) {
      const event = await withTenantIdTransaction(tenantId, async transaction => {
        const claimed = await transaction.execute<Claimed>(sql`
          with candidate as (
            select id from outbox_events where tenant_id = ${tenantId}::uuid
              and event_type = 'order.whatsapp_owner_cash_pending' and published_at is null
              and dead_letter_at is null and available_at <= now()
              and (leased_until is null or leased_until < now())
            order by sequence limit 1 for update skip locked
          )
          update outbox_events event set claimed_by = ${workerId},
            leased_until = now() + interval '60 seconds', attempts = event.attempts + 1
          from candidate where event.id = candidate.id
          returning event.id, event.aggregate_id as order_id, event.attempts
        `);
        return claimed.rows[0];
      });
      if (!event) break;
      remaining--;
      try {
        const details = await withTenantIdTransaction(tenantId, async transaction => {
          const [tenant] = await transaction.select({ name: tenants.name, preset: tenants.preset })
            .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
          const [settings] = await transaction.select({ phone: tenantSettings.ownerCashAlertWhatsAppPhone })
            .from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
          const [order] = await transaction.select({ id: tenantOrders.id, purchaseNumber: tenantOrders.purchaseNumber,
            total: tenantOrders.total, currency: tenantOrders.currency, tender: tenantOrders.tender,
            paymentStatus: tenantOrders.paymentStatus, fulfillmentStatus: tenantOrders.fulfillmentStatus,
            source: tenantOrders.source }).from(tenantOrders).where(and(
              eq(tenantOrders.tenantId, tenantId), eq(tenantOrders.id, event.order_id),
            )).limit(1);
          const items = order ? await transaction.select({ name: orderLines.name, quantity: orderLines.quantity })
            .from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, event.order_id))) : [];
          return { tenant, settings, order, items };
        });
        const phone = normalizeWhatsAppRecipient(details.settings?.phone);
        const order = details.order;
        if (details.tenant?.preset !== "express_retail" || !phone || !order || order.tender !== "cash" ||
          order.paymentStatus !== "pending" || order.fulfillmentStatus === "cancelled" || order.source !== "admin_direct") {
          skipped++;
        } else {
          const itemSummary = details.items.map(item => `${item.quantity}× ${item.name}`).join(", ").slice(0, 500) || "Artículos del pedido";
          await sendOwnerCashPendingWhatsApp({ phone, business: details.tenant.name,
            purchaseNumber: String(order.purchaseNumber), amount: `${order.total} ${order.currency}`, items: itemSummary });
          sent++;
        }
        await withTenantIdTransaction(tenantId, async transaction => transaction.execute(sql`
          update outbox_events set published_at = now(), claimed_by = null, leased_until = null, last_error = null
          where id = ${event.id}::uuid and claimed_by = ${workerId}
        `));
      } catch {
        await withTenantIdTransaction(tenantId, async transaction => transaction.execute(sql`
          update outbox_events set claimed_by = null, leased_until = null,
            available_at = now() + interval '5 minutes', last_error = 'WhatsApp delivery failed',
            dead_letter_at = case when attempts >= 5 then now() else dead_letter_at end
          where id = ${event.id}::uuid and claimed_by = ${workerId}
        `));
        failed++;
      }
    }
    if (!remaining) break;
  }
  return { sent, skipped, failed };
}
