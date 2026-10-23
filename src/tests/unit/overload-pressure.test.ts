import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESSURE_THRESHOLDS,
  buildPressureSnapshot,
  classifyPressure,
  pressureThresholdsFromEnv,
  type PressureSources,
} from "@/lib/observability/pressure";

const normalSources: PressureSources = {
  eventLoopLagMs: 5,
  cpuUtilization: 0.2,
  heapUtilization: 0.3,
  poolWaiting: 0,
  poolTotal: 2,
  poolMax: 20,
  inFlightRequests: 4,
  sseConnections: 10,
};

describe("overload pressure telemetry", () => {
  it("reports normal pressure and no fallback action when every signal is below threshold", () => {
    const snapshot = buildPressureSnapshot(
      normalSources,
      DEFAULT_PRESSURE_THRESHOLDS,
      new Date("2026-10-23T00:00:00.000Z"),
    );

    expect(snapshot.state).toBe("normal");
    expect(snapshot.recommendedAction).toBe("none");
    expect(snapshot.reasons).toEqual([]);
    expect(snapshot.sampledAt).toBe("2026-10-23T00:00:00.000Z");
  });

  it("escalates to elevated and prepares non-critical shedding", () => {
    const snapshot = buildPressureSnapshot({
      ...normalSources,
      poolWaiting: 2,
      eventLoopLagMs: 140,
    });

    expect(snapshot.state).toBe("elevated");
    expect(snapshot.recommendedAction).toBe("shed_non_critical");
    expect(snapshot.reasons).toEqual(
      expect.arrayContaining(["event_loop_lag", "pg_pool_waiting"]),
    );
    expect(
      snapshot.signals.find((entry) => entry.name === "pg_pool_waiting")?.level,
    ).toBe("elevated");
  });

  it("escalates to critical and activates the fallback action", () => {
    const snapshot = buildPressureSnapshot({
      ...normalSources,
      poolTotal: 20,
      poolWaiting: 8,
      sseConnections: 500,
    });

    expect(snapshot.state).toBe("critical");
    expect(snapshot.recommendedAction).toBe("activate_fallback");
    expect(
      snapshot.signals.find((entry) => entry.name === "sse_connections")?.level,
    ).toBe("critical");
  });

  it("treats a zero pool budget as no utilization instead of dividing by zero", () => {
    const snapshot = buildPressureSnapshot({
      ...normalSources,
      poolTotal: 10,
      poolMax: 0,
    });

    expect(
      snapshot.signals.find((entry) => entry.name === "pg_pool_utilization")
        ?.value,
    ).toBe(0);
  });

  it("classifies values at the configured boundary", () => {
    expect(classifyPressure(99.99, { elevated: 100, critical: 500 })).toBe(
      "normal",
    );
    expect(classifyPressure(100, { elevated: 100, critical: 500 })).toBe(
      "elevated",
    );
    expect(classifyPressure(500, { elevated: 100, critical: 500 })).toBe(
      "critical",
    );
  });

  it("reads thresholds from the environment and keeps defaults for missing keys", () => {
    const thresholds = pressureThresholdsFromEnv({
      PRESSURE_EVENT_LOOP_LAG_MS_ELEVATED: "50",
      PRESSURE_PG_POOL_WAITING_CRITICAL: "12",
      PRESSURE_CPU_UTILIZATION_ELEVATED: "not-a-number",
    } as unknown as NodeJS.ProcessEnv);

    expect(thresholds.event_loop_lag).toEqual({
      elevated: 50,
      critical: DEFAULT_PRESSURE_THRESHOLDS.event_loop_lag.critical,
    });
    expect(thresholds.pg_pool_waiting.critical).toBe(12);
    expect(thresholds.cpu_utilization.elevated).toBe(
      DEFAULT_PRESSURE_THRESHOLDS.cpu_utilization.elevated,
    );
  });
});
