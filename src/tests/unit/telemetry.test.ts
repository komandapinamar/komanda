import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { context, metrics, propagation, trace } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { InMemoryMetricExporter, AggregationTemporality, DataPointType } from "@opentelemetry/sdk-metrics";

const exporters = vi.hoisted(() => ({ spans: undefined as unknown, metrics: undefined as unknown }));
vi.mock("@opentelemetry/exporter-trace-otlp-proto", () => ({
  OTLPTraceExporter: vi.fn(function () { return exporters.spans; }),
}));
vi.mock("@opentelemetry/exporter-metrics-otlp-proto", () => ({
  OTLPMetricExporter: vi.fn(function () { return exporters.metrics; }),
}));

let telemetry: typeof import("@/lib/observability/telemetry");
let spans: InMemorySpanExporter;
let metricExporter: InMemoryMetricExporter;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("__komandaTelemetry", undefined);
  spans = new InMemorySpanExporter();
  metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  exporters.spans = spans;
  exporters.metrics = metricExporter;
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318");
  vi.stubEnv("OTEL_TRACES_SAMPLER_ARG", "1");
  vi.stubEnv("KOMANDA_TELEMETRY_IDENTIFIER_KEY", "synthetic-key-that-is-at-least-32-characters");
  telemetry = await import("@/lib/observability/telemetry");
});

afterEach(async () => {
  await telemetry.shutdownTelemetry();
  trace.disable();
  metrics.disable();
  context.disable();
  propagation.disable();
});

describe("manual server telemetry", () => {
  it("executes business work exactly once if instrumentation itself fails", async () => {
    vi.spyOn(trace, "getTracer").mockImplementation(() => { throw new Error("telemetry failure"); });
    const run = vi.fn().mockResolvedValue({ authorized: true });
    await expect(telemetry.observeOperation("payment.collect_cash", {}, run)).resolves.toEqual({ authorized: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("shares one lifecycle across separate module loads (Next instrumentation/route bundles)", async () => {
    const initialization = telemetry.initializeTelemetry("komanda-web");
    await initialization;
    vi.resetModules();
    const secondCopy = await import("@/lib/observability/telemetry");
    expect(secondCopy.initializeTelemetry("komanda-fastify")).toBe(initialization);
    const captured: Array<import("@opentelemetry/sdk-trace-base").ReadableSpan> = [];
    vi.spyOn(spans, "export").mockImplementation((batch, done) => { captured.push(...batch); done({ code: 0 }); });
    await secondCopy.observeOperation("print.claim", {}, async () => undefined);
    await secondCopy.shutdownTelemetry();
    expect(captured).toHaveLength(1);
    expect(captured[0].resource.attributes["service.name"]).toBe("komanda-web");
  });

  it("does not export in test without an endpoint", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    await telemetry.initializeTelemetry();
    await telemetry.observeOperation("order.create_direct", {}, async () => "unchanged");
    expect(spans.getFinishedSpans()).toEqual([]);
    expect(metricExporter.getMetrics()).toEqual([]);
  });

  it("rejects an endpoint with embedded credentials instead of exporting", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://user:secret@example.org/otlp");
    await expect(telemetry.initializeTelemetry()).rejects.toThrow(/not an allowed base URL/);
    await telemetry.observeOperation("print.report", {}, async () => undefined);
    expect(spans.getFinishedSpans()).toEqual([]);
    expect(metricExporter.getMetrics()).toEqual([]);
  });

  it("records committed events outside an operation instead of dropping them", async () => {
    const captured: import("@opentelemetry/sdk-metrics").ResourceMetrics[] = [];
    vi.spyOn(metricExporter, "export").mockImplementation((batch, done) => { captured.push(batch); done({ code: 0 }); });
    await telemetry.initializeTelemetry();
    telemetry.committedEvent("order.created", { result: "ok" });
    await telemetry.shutdownTelemetry();
    const points = captured.flatMap((resource) => resource.scopeMetrics.flatMap((scope) =>
      scope.metrics.flatMap((metric) => metric.descriptor.name === "komanda.events" && metric.dataPointType === DataPointType.SUM ? metric.dataPoints : [])));
    expect(points.find((point) => point.attributes.event === "order.created")?.value).toBe(1);
  });

  it("keeps committed events when instrumentation fails before the span starts", async () => {
    const captured: import("@opentelemetry/sdk-metrics").ResourceMetrics[] = [];
    vi.spyOn(metricExporter, "export").mockImplementation((batch, done) => { captured.push(batch); done({ code: 0 }); });
    await telemetry.initializeTelemetry();
    vi.spyOn(trace, "getTracer").mockImplementation(() => { throw new Error("telemetry failure"); });
    await telemetry.observeOperation("order.create_direct", {}, async () => {
      telemetry.committedEvent("order.created", { result: "ok" });
      return "created";
    });
    await telemetry.shutdownTelemetry();
    const points = captured.flatMap((resource) => resource.scopeMetrics.flatMap((scope) =>
      scope.metrics.flatMap((metric) => metric.descriptor.name === "komanda.events" && metric.dataPointType === DataPointType.SUM ? metric.dataPoints : [])));
    expect(points.find((point) => point.attributes.event === "order.created")?.value).toBe(1);
  });

  it("uses a bounded metric vocabulary and rejects arbitrary tags", () => {
    expect(telemetry.metricAttributes("worker.iteration_failed", {
      tenantId: "tenant", correlationId: "correlation", result: "failed",
      tags: { worker: "outbox-dispatch", token: "secret", error: "email@example.org", traceId: "trace" },
    })).toEqual({ event: "worker.iteration_failed", result: "failed", worker: "outbox-dispatch" });
    expect(telemetry.metricAttributes("worker.iteration_failed", { tags: { worker: "arbitrary" } }))
      .toEqual({ event: "worker.iteration_failed" });
    expect(telemetry.metricAttributes("customer@example.org", {})).toEqual({ event: "unknown" });
  });

  it("isolates concurrent roots, hashes allowlisted IDs, omits payloads and framework spans", async () => {
    // Capture exports on shutdown rather than relying on interval timing.
    const captured: Array<import("@opentelemetry/sdk-trace-base").ReadableSpan> = [];
    vi.spyOn(spans, "export").mockImplementation((batch, done) => {
      captured.push(...batch);
      done({ code: 0 });
    });
    await Promise.all([telemetry.initializeTelemetry(), telemetry.initializeTelemetry()]);
    await Promise.all(["a", "b"].map((id) => telemetry.observeOperation("outbox.deliver", {
      tenantId: id, eventId: id, ...{ payload: "customer@example.org", token: "secret" },
    }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      telemetry.operationIdentifiers({ orderId: id });
      trace.getTracer("next").startSpan("GET /secret?token=secret").end();
    })));
    await telemetry.shutdownTelemetry();
    expect(captured).toHaveLength(2);
    expect(captured[0].spanContext().traceId).not.toBe(captured[1].spanContext().traceId);
    for (const span of captured) {
      expect(span.parentSpanContext).toBeUndefined();
      expect(span.resource.attributes).toMatchObject({ "service.name": "komanda-web" });
      expect(span.attributes["komanda.tenantId"]).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.keys(span.attributes).sort()).toEqual(["komanda.eventId", "komanda.orderId", "komanda.tenantId", "outcome"]);
      expect(JSON.stringify(span.attributes)).not.toContain("customer@");
    }
  });

  it("does not inherit context between concurrent outbox dispatcher deliveries", async () => {
    vi.doMock("@/db/tenant-transaction", () => ({ withPlatformServiceTransaction: vi.fn() }));
    const { OutboxDispatcher } = await import("@/lib/outbox/outbox-dispatcher");
    const captured: Array<import("@opentelemetry/sdk-trace-base").ReadableSpan> = [];
    vi.spyOn(spans, "export").mockImplementation((batch, done) => { captured.push(...batch); done({ code: 0 }); });
    await telemetry.initializeTelemetry("komanda-outbox");
    const active: string[] = [];
    const dispatchers = ["first", "second"].map((id) => {
      const dispatcher = new OutboxDispatcher({
        consumers: { "order.created": async () => {
          const before = trace.getActiveSpan()?.spanContext().traceId;
          await new Promise((resolve) => setTimeout(resolve, 2));
          expect(trace.getActiveSpan()?.spanContext().traceId).toBe(before);
          active.push(before!);
        } },
      });
      const persistence = dispatcher as unknown as {
        claimBatch: () => Promise<import("@/lib/outbox/outbox-dispatcher").ClaimedOutboxEvent[]>;
        markPublished: (id: string) => Promise<void>;
      };
      vi.spyOn(persistence, "claimBatch").mockResolvedValue([{
        id, tenantId: id, aggregateType: "order", aggregateId: id,
        eventType: "order.created", payload: { customer: "never-export-this" },
        sequence: "1", attempts: 1,
      }]);
      vi.spyOn(persistence, "markPublished").mockResolvedValue(undefined);
      return dispatcher;
    });
    await Promise.all(dispatchers.map((dispatcher) => dispatcher.dispatchOnce()));
    await telemetry.shutdownTelemetry();
    expect(new Set(active).size).toBe(2);
    expect(captured).toHaveLength(2);
    expect(captured.every((span) => span.parentSpanContext === undefined)).toBe(true);
    expect(JSON.stringify(captured.map((span) => span.attributes))).not.toContain("never-export-this");
  });

  it("counts committed changes only after success, never after rollback or replay", async () => {
    const captured: import("@opentelemetry/sdk-metrics").ResourceMetrics[] = [];
    vi.spyOn(metricExporter, "export").mockImplementation((batch, done) => {
      captured.push(batch);
      done({ code: 0 });
    });
    await telemetry.initializeTelemetry("komanda-reconcile");
    await telemetry.observeOperation("payment.reconcile", {}, async () => {
      telemetry.committedEvent("payment.reconciled", { result: "ok" });
    });
    const original = new Error("private customer error");
    await expect(telemetry.observeOperation("payment.reconcile", {}, async () => {
      telemetry.committedEvent("payment.reconciled", { result: "ok" });
      throw original;
    })).rejects.toBe(original);
    await telemetry.observeOperation("payment.reconcile", {}, async () => "replay");
    await telemetry.shutdownTelemetry();
    const points = captured.flatMap((resource) => resource.scopeMetrics.flatMap((scope) =>
      scope.metrics.flatMap((metric) => metric.descriptor.name === "komanda.events" && metric.dataPointType === DataPointType.SUM ? metric.dataPoints : [])));
    expect(points.find((point) => point.attributes.event === "payment.reconciled")?.value).toBe(1);
    expect(points.filter((point) => point.attributes.event === "operation.attempt").map((point) => point.value).sort()).toEqual([1, 2]);
    expect(JSON.stringify(captured)).not.toContain("private customer");
  });

  it("preserves successful results and original errors when exporters reject", async () => {
    vi.spyOn(spans, "export").mockImplementation((_batch, done) => done({ code: 1, error: new Error("rejected") }));
    vi.spyOn(metricExporter, "export").mockImplementation((_batch, done) => done({ code: 1 }));
    await telemetry.initializeTelemetry();
    await expect(telemetry.observeOperation("print.report", {}, async () => ({ status: "printed" })))
      .resolves.toEqual({ status: "printed" });
    const original = new Error("authorization denied");
    await expect(telemetry.observeOperation("payment.collect_cash", {}, async () => { throw original; })).rejects.toBe(original);
    await expect(telemetry.shutdownTelemetry()).resolves.toBeUndefined();
  });

  it("bounds shutdown even if an exporter never resolves", async () => {
    vi.spyOn(spans, "shutdown").mockImplementation(() => new Promise(() => {}));
    await telemetry.initializeTelemetry();
    vi.useFakeTimers();
    const shutdown = telemetry.shutdownTelemetry();
    await vi.advanceTimersByTimeAsync(3600);
    await expect(shutdown).resolves.toBeUndefined();
    expect(telemetry.shutdownTelemetry()).toBe(shutdown);
    vi.useRealTimers();
  });
});
