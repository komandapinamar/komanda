import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { emitMetric } from "@/lib/observability/metrics";
import { createServer } from "node:http";
import { context, metrics, propagation, trace } from "@opentelemetry/api";
import { vi } from "vitest";
import { initializeTelemetry, observeOperation, committedEvent, shutdownTelemetry } from "@/lib/observability/telemetry";

describe("observability", () => {
  it("exposes dependency-specific health checks", async () => {
    const [health, route] = await Promise.all([
      readFile("lib/observability/health.ts", "utf8"),
      readFile("app/api/health/route.ts", "utf8"),
    ]);

    for (const dependency of [
      "database",
      "object_storage",
      "mercadopago",
      "outbox",
      "printing",
    ]) {
      expect(health).toContain(dependency);
    }
    expect(route).toContain("collectHealth");
  });

  it("emits safe metric envelopes for multi-tenant events", () => {
    const metric = emitMetric("order.event", {
      tenantId: "tenant-a",
      correlationId: "00000000-0000-4000-8000-000000000001",
      result: "ok",
      latencyMs: 12,
    });

    expect(metric).toMatchObject({
      event: "order.event",
      tenantId: "tenant-a",
      result: "ok",
      latencyMs: 12,
    });
  });

  it("exports a synthetic operation flow over local OTLP HTTP/protobuf and drains final metrics", async () => {
    const requests: Array<{ url?: string; type?: string; body: Buffer }> = [];
    const receiver = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({ url: request.url, type: request.headers["content-type"], body: Buffer.concat(chunks) });
      response.writeHead(200, { "Content-Type": "application/x-protobuf" });
      response.end();
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    const address = receiver.address() as import("node:net").AddressInfo;
    vi.stubEnv("KOMANDA_TELEMETRY_ENABLED", "true");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `http://127.0.0.1:${address.port}`);
    vi.stubEnv("OTEL_TRACES_SAMPLER_ARG", "1");
    vi.stubEnv("KOMANDA_TELEMETRY_IDENTIFIER_KEY", "synthetic-test-key-never-used-in-production");
    try {
      await initializeTelemetry("komanda-web");
      for (const operation of ["order.create_direct", "payment.collect_cash", "print.report"] as const) {
        await observeOperation(operation, { tenantId: "private-tenant", orderId: "private-order" }, async () => {
          emitMetric("order.event", {
            tenantId: "private-tenant", tags: { token: "private-token", error: "customer@example.org" },
          });
          committedEvent("order.created", { result: "ok" });
        });
      }
      await shutdownTelemetry();
      expect(requests.map((request) => request.url).sort()).toEqual(["/v1/metrics", "/v1/traces"]);
      for (const request of requests) {
        expect(request.type).toMatch(/application\/x-protobuf/);
        const wire = request.body.toString("utf8");
        for (const forbidden of ["private-tenant", "private-order", "private-token", "customer@example.org"]) {
          expect(wire).not.toContain(forbidden);
        }
      }
      const traces = requests.find((request) => request.url === "/v1/traces")!.body.toString("utf8");
      expect(traces).toContain("order.create_direct");
      expect(traces).toContain("payment.collect_cash");
      expect(traces).toContain("print.report");
      const exportedMetrics = requests.find((request) => request.url === "/v1/metrics")!.body.toString("utf8");
      expect(exportedMetrics).toContain("komanda.events");
      expect(exportedMetrics).toContain("komanda.operation.duration");
      expect(exportedMetrics).not.toContain("komanda.orderId");
    } finally {
      await shutdownTelemetry();
      await new Promise<void>((resolve, reject) => receiver.close((error) => error ? reject(error) : resolve()));
      trace.disable(); metrics.disable(); context.disable(); propagation.disable();
    }
  });
});
