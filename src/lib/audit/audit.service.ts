import { auditEvents } from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import type { TenantContext } from "@/lib/tenant-context/types";
import { redactSensitiveData } from "@/lib/observability/request-context";

export async function appendAuditEvent(
  transaction: TenantTransaction,
  context: TenantContext,
  event: {
    action: string;
    resourceType: string;
    resourceId: string;
    outcome: "allowed" | "denied" | "failed";
    metadata?: Record<string, unknown>;
  },
) {
  const actorUserId =
    context.actor.kind === "user" ? context.actor.userId : null;
  const metadata = redactSensitiveData(event.metadata ?? {}) as Record<
    string,
    unknown
  >;

  const [persisted] = await transaction
    .insert(auditEvents)
    .values({
      tenantId: context.tenantId,
      actorUserId,
      correlationId: context.correlationId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      outcome: event.outcome,
      metadata,
    })
    .returning({ id: auditEvents.id });
  return persisted;
}
