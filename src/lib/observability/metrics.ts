export type MetricEvent =
  | "provisioning.completed"
  | "provisioning.failed"
  | "entitlement.denied"
  | "rls.denied"
  | "webhook.processed"
  | "webhook.ignored"
  | "order.event"
  | "outbox.created"
  | "print.lease.claimed"
  | "print.lease.expired"
  | "migration.reported";

export type MetricFields = {
  tenantId?: string;
  correlationId?: string;
  result?: "ok" | "denied" | "failed" | "ignored";
  latencyMs?: number;
  count?: number;
  tags?: Record<string, string>;
};

export function emitMetric(event: MetricEvent, fields: MetricFields = {}) {
  const payload = {
    event,
    tenantId: fields.tenantId,
    correlationId: fields.correlationId,
    result: fields.result,
    latencyMs: fields.latencyMs,
    count: fields.count ?? 1,
    tags: fields.tags ?? {},
    emittedAt: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== "test") {
    console.info("[metric]", JSON.stringify(payload));
  }

  return payload;
}
