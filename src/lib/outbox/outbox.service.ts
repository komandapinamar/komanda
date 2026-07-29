import { sql } from "drizzle-orm";
import { outboxEvents } from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import type { TenantContext } from "@/lib/tenant-context/types";
import { redactSensitiveData } from "@/lib/observability/request-context";

async function nextOutboxSequence(
  transaction: TenantTransaction,
  tenantId: string,
) {
  const result = await transaction.execute<{ current_value: string }>(sql`
    insert into tenant_counters (tenant_id, counter_type, current_value)
    values (${tenantId}::uuid, 'outbox_sequence', 1)
    on conflict (tenant_id, counter_type)
    do update set current_value = tenant_counters.current_value + 1,
                  updated_at = now()
    returning current_value
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Failed to allocate outbox sequence.");
  return BigInt(row.current_value);
}

export async function appendOutboxEvent(
  transaction: TenantTransaction,
  context: TenantContext,
  event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    availableAt?: Date;
  },
) {
  const sequence = await nextOutboxSequence(transaction, context.tenantId);
  const payload = redactSensitiveData(event.payload ?? {}) as Record<
    string,
    unknown
  >;
  const [persisted] = await transaction
    .insert(outboxEvents)
    .values({
      tenantId: context.tenantId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload,
      sequence,
      availableAt: event.availableAt,
    })
    .returning({ id: outboxEvents.id, sequence: outboxEvents.sequence });
  return persisted;
}
