import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { emitMetric } from "@/lib/observability/metrics";

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

  it("exposes an overload pressure snapshot route", async () => {
    const [route, pressure] = await Promise.all([
      readFile("app/api/health/pressure/route.ts", "utf8"),
      readFile("lib/observability/pressure.ts", "utf8"),
    ]);

    expect(route).toContain("readPressureSnapshot");
    expect(pressure).toContain("recommendedAction");
    expect(pressure).toContain("activate_fallback");
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
});
