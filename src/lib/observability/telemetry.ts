import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { metrics, ROOT_CONTEXT, SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { config, ConfigurationError } from "@/lib/config";
import type { MetricFields } from "./metrics";

const operations = [
  "order.create_direct", "order.create_items", "order.create_paid", "payment.collect_cash",
  "payment.webhook", "payment.reconcile", "print.claim", "print.report",
  "print.enqueue", "outbox.deliver",
] as const;
export type Operation = typeof operations[number];
const serviceNames = ["komanda-web", "komanda-fastify", "komanda-outbox", "komanda-reconcile"] as const;
const identities = ["tenantId", "orderId", "paymentAttemptId", "attemptId", "jobId", "correlationId", "eventId"] as const;
type Identifiers = Partial<Record<typeof identities[number], string | undefined>>;
type PendingEvent = { event: string; fields: MetricFields };
type TelemetryState = {
  pending: AsyncLocalStorage<PendingEvent[]>;
  sdk?: NodeSDK;
  starting?: Promise<void>;
  stopping?: Promise<void>;
  record?: (event: string, fields: MetricFields) => void;
};
// Next instrumentation and route bundles can load separate copies of this module.
// Share lifecycle and deferred events across those copies and development reloads.
const processState = globalThis as typeof globalThis & { __komandaTelemetry?: TelemetryState };
const state = processState.__komandaTelemetry ??= { pending: new AsyncLocalStorage<PendingEvent[]>() };
const pending = state.pending;

// These finite vocabularies are the entire metric-label contract.
const vocabularies: Record<string, Record<string, readonly string[]>> = {
  "worker.iteration_completed": { worker: ["outbox-dispatch", "payment-reconciliation"] },
  "worker.iteration_failed": { worker: ["outbox-dispatch", "payment-reconciliation"] },
};
const results = ["ok", "denied", "failed", "ignored"];
const outcomes = ["ok", "failed"];
const exportedEvents = new Set([
  "operation.attempt", "order.created", "payment.cash_collected", "payment.status_changed",
  "print.claimed", "print.device_reported_printed", "print.device_reported_failed",
  "provisioning.completed", "provisioning.failed", "entitlement.denied", "rls.denied",
  "webhook.processed", "webhook.ignored", "order.event", "outbox.created",
  "print.lease.claimed", "print.lease.expired", "outbox.claimed", "outbox.dispatched",
  "outbox.failed", "outbox.retry_scheduled", "outbox.dead_lettered", "outbox.consumer_applied",
  "outbox.consumer_skipped", "outbox.claim_stalled", "payment.verification_required",
  "payment.reconciled", "payment.reconciliation_failed", "payment.reconciliation_scanned",
  "payment.verification_lag_alert", "worker.iteration_completed", "worker.iteration_failed",
  "migration.reported", "identity.password_reset.delivery_failed",
]);

export function metricAttributes(event: string, fields: MetricFields): Attributes {
  const attributes: Attributes = { event: exportedEvents.has(event) ? event : "unknown" };
  if (fields.result && results.includes(fields.result)) attributes.result = fields.result;
  for (const [key, values] of Object.entries(vocabularies[event] ?? {})) {
    const value = fields.tags?.[key];
    if (value && values.includes(value)) attributes[key] = value;
  }
  return attributes;
}

function protectedAttributes(fields: Identifiers): Attributes {
  const key = config.telemetry.identifierKey();
  if (!key || key.length < 32) return {};
  const attributes: Attributes = {};
  for (const name of identities) {
    const value = fields[name];
    if (typeof value === "string" && value.length > 0 && value.length <= 256) {
      attributes[`komanda.${name}`] = createHmac("sha256", key).update(`${name}:${value}`).digest("hex");
    }
  }
  return attributes;
}

export function operationIdentifiers(fields: Identifiers) {
  try { trace.getActiveSpan()?.setAttributes(protectedAttributes(fields)); } catch { /* Best effort. */ }
}

export function recordMetric(event: string, fields: MetricFields) {
  try { state.record?.(event, fields); } catch { /* Export is never a business dependency. */ }
}

/**
 * Call only inside the operation's transaction. Buffered until the enclosing
 * operation succeeds. Outside an operation it is recorded immediately: dropping
 * it silently would hide real commits.
 */
export function committedEvent(event: string, fields: MetricFields = {}) {
  const store = pending.getStore();
  if (store) store.push({ event, fields });
  else release([{ event, fields }]);
}

function bestEffort(effect: () => void) {
  try { effect(); } catch { /* Telemetry must not replace a business result/error. */ }
}

function release(events: PendingEvent[]) {
  for (const event of events) {
    // Preserve the console envelope operators already rely on, now emitted
    // when the enclosing operation commits rather than before it.
    if (process.env.NODE_ENV !== "test") {
      console.info("[metric]", JSON.stringify({
        event: event.event,
        tenantId: event.fields.tenantId,
        correlationId: event.fields.correlationId,
        result: event.fields.result,
        latencyMs: event.fields.latencyMs,
        count: event.fields.count ?? 1,
        tags: event.fields.tags ?? {},
        emittedAt: new Date().toISOString(),
      }));
    }
    recordMetric(event.event, event.fields);
  }
}

export async function observeOperation<T>(
  operation: Operation, identifiers: Identifiers, run: () => Promise<T>,
): Promise<T> {
  // Do not inherit request/webhook/device context or fabricate durable propagation.
  let entered = false;
  try {
    const tracer = trace.getTracer("komanda.operations");
    return await tracer.startActiveSpan(operation, { attributes: protectedAttributes(identifiers) }, ROOT_CONTEXT, async (span) => {
      entered = true;
      const parent = pending.getStore();
      const events: PendingEvent[] = [];
      const started = performance.now();
      let outcome = "ok";
      try {
        const value = await pending.run(events, run);
        if (parent) parent.push(...events);
        else release(events);
        bestEffort(() => span.setStatus({ code: SpanStatusCode.OK }));
        return value;
      } catch (error) {
        outcome = "failed";
        // Never record exception messages, stacks or arbitrary status descriptions.
        bestEffort(() => span.setStatus({ code: SpanStatusCode.ERROR }));
        throw error;
      } finally {
        bestEffort(() => span.setAttribute("outcome", outcome));
        recordMetric("operation.attempt", {
          result: outcome === "ok" ? "ok" : "failed",
          latencyMs: performance.now() - started,
          tags: { operation },
        });
        bestEffort(() => span.end());
      }
    });
  } catch (error) {
    if (entered) throw error;
    // Instrumentation failed before invoking business work. Never invoke it
    // twice, but keep recording committed events outside a span.
    const events: PendingEvent[] = [];
    const value = await pending.run(events, run);
    release(events);
    return value;
  }
}

function parseHeaders(raw: string | undefined, problems: string[]): Record<string, string> {
  if (!raw) return {};
  const headers: Record<string, string> = {};
  for (const entry of raw.split(",").filter((item) => item.trim())) {
    const index = entry.indexOf("=");
    if (index < 1) {
      problems.push("OTEL_EXPORTER_OTLP_HEADERS has a malformed entry.");
      continue;
    }
    try {
      headers[entry.slice(0, index).trim()] = decodeURIComponent(entry.slice(index + 1).trim());
    } catch {
      problems.push("OTEL_EXPORTER_OTLP_HEADERS has an invalid percent-encoding.");
    }
  }
  return headers;
}

function configuration(serviceName: string) {
  const environment = config.environment();
  const endpointValue = config.telemetry.endpoint();
  // Local development and unit tests only export when explicitly configured.
  if (environment === "test" && !endpointValue) return undefined;

  const problems: string[] = [];
  if (!endpointValue) problems.push("OTEL_EXPORTER_OTLP_ENDPOINT is required.");
  const endpoint = endpointValue ? new URL(endpointValue) : undefined;
  if (endpoint) {
    if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      problems.push("OTEL_EXPORTER_OTLP_ENDPOINT is not an allowed base URL.");
    } else if (endpoint.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
      problems.push("OTEL_EXPORTER_OTLP_ENDPOINT must use HTTPS outside loopback.");
    }
  }
  const headers = parseHeaders(config.telemetry.headers(), problems);
  if (environment !== "test" && Object.keys(headers).length === 0) {
    problems.push("OTEL_EXPORTER_OTLP_HEADERS is required.");
  }
  const identifierKey = config.telemetry.identifierKey();
  if (environment !== "test" && (!identifierKey || identifierKey.length < 32)) {
    problems.push("KOMANDA_TELEMETRY_IDENTIFIER_KEY must have at least 32 characters.");
  }
  if (!serviceNames.includes(serviceName as typeof serviceNames[number])) {
    problems.push(`Unknown OTEL_SERVICE_NAME "${serviceName}".`);
  }
  if (problems.length > 0) throw new ConfigurationError(problems);

  return {
    endpoint: endpoint!.href.replace(/\/$/, ""),
    headers,
    ratio: config.telemetry.samplingRatio(),
    serviceName,
    environment,
    version: process.env.KOMANDA_SERVICE_VERSION?.trim() || process.env.NEXT_DEPLOYMENT_ID?.trim() || undefined,
  };
}

export function initializeTelemetry(serviceName = config.telemetry.serviceName() ?? "komanda-web"): Promise<void> {
  if (state.starting) return state.starting;
  state.starting = Promise.resolve().then(() => {
    let diagnostics: string | undefined;
    try {
      const settings = configuration(serviceName);
      if (!settings) return;
      const batch = new BatchSpanProcessor(new OTLPTraceExporter({
        url: `${settings.endpoint}/v1/traces`, headers: settings.headers, timeoutMillis: 2000,
      }), { maxQueueSize: 512, maxExportBatchSize: 64, scheduledDelayMillis: 5000, exportTimeoutMillis: 2000 });
      state.sdk = new NodeSDK({
        autoDetectResources: false,
        resource: resourceFromAttributes({
          "service.name": settings.serviceName,
          "deployment.environment": settings.environment,
          ...(settings.version ? { "service.version": settings.version } : {}),
          ...(process.env.HOSTNAME?.trim() ? { "service.instance.id": process.env.HOSTNAME.trim() } : {}),
        }),
        sampler: new TraceIdRatioBasedSampler(settings.ratio),
        // Next may produce its own spans containing URLs. Export only ours.
        spanProcessors: [{
          onStart() {},
          onEnd(span) { if (span.instrumentationScope.name === "komanda.operations") batch.onEnd(span); },
          forceFlush: () => batch.forceFlush(),
          shutdown: () => batch.shutdown(),
        }],
        metricReader: new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${settings.endpoint}/v1/metrics`, headers: settings.headers, timeoutMillis: 2000 }),
          exportIntervalMillis: 15000, exportTimeoutMillis: 3000,
        }),
        instrumentations: [],
        logRecordProcessors: [],
        textMapPropagator: { inject() {}, extract: (context) => context, fields: () => [] },
      });
      state.sdk.start();
      // Use API after SDK registration; no instruments/exporters exist while disabled.
      const meter = sdkMeter();
      const events = meter.createCounter("komanda.events", { description: "Best-effort event counts, not a financial ledger" });
      const duration = meter.createHistogram("komanda.operation.duration", { unit: "s" });
      state.record = (event, fields) => {
        const attributes = metricAttributes(event, fields);
        if (event === "operation.attempt") {
          const operation = fields.tags?.operation;
          if (!operations.includes(operation as Operation)) return;
          attributes.operation = operation;
          if (!outcomes.includes(String(attributes.result))) return;
        }
        const count = fields.count ?? 1;
        if (Number.isFinite(count) && count >= 0) events.add(count, attributes);
        if (Number.isFinite(fields.latencyMs) && fields.latencyMs! >= 0) duration.record(fields.latencyMs! / 1000, attributes);
      };
      diagnostics = `[telemetry] ${settings.serviceName} (${settings.environment}) -> ${new URL(settings.endpoint).host}`;
    } catch (error) {
      state.record = undefined;
      // Configuration problems are fatal in prod/stg: telemetry is required.
      const report = error instanceof ConfigurationError ? error.problems : ["Unexpected telemetry initialization failure."];
      // In test, an absent endpoint simply disables export; an explicitly
      // configured but invalid endpoint must still fail loudly.
      if (config.environment() !== "test" || config.telemetry.endpoint()) {
        throw new ConfigurationError(report);
      }
      console.warn("[telemetry] Disabled in test:", report.join(" "));
    }
    if (diagnostics) console.info(diagnostics);
  });
  return state.starting;
}

function sdkMeter() { return metrics.getMeter("komanda.operations"); }

/** Bounded and idempotent; signal ownership remains with the existing runtime. */
export function shutdownTelemetry(): Promise<void> {
  if (state.stopping) return state.stopping;
  state.stopping = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => { await state.starting; await state.sdk?.shutdown(); })(),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, 3500); timer.unref(); }),
      ]);
    } catch { /* Best effort. */ }
    finally { if (timer) clearTimeout(timer); state.record = undefined; }
  })();
  return state.stopping;
}
