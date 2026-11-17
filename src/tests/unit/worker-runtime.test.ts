import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  runtimePool: { end: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/observability/telemetry", () => ({
  shutdownTelemetry: vi.fn().mockResolvedValue(undefined),
  recordMetric: vi.fn(),
}));

const { runWorkerLoop, parseWorkerInterval } = await import(
  "@/workers/runtime/worker-runtime"
);

describe("runtime de workers", () => {
  it.each(["once", "SIGTERM"] as const)("flushes after completed work in %s mode", async (mode) => {
    const { shutdownTelemetry } = await import("@/lib/observability/telemetry");
    const order: string[] = [];
    vi.mocked(shutdownTelemetry).mockImplementation(async () => { order.push("flush"); });
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const finished = new Promise<void>((resolve) => { release = resolve; });
    const worker = runWorkerLoop({
      name: "outbox-dispatch", intervalMs: 1, once: mode === "once",
      registerSignals: mode === "SIGTERM", closePool: false,
      run: async () => { started(); await finished; order.push("completed"); },
    });
    await ready;
    if (mode === "SIGTERM") process.emit("SIGTERM");
    expect(order).toEqual([]);
    release();
    await worker;
    expect(order).toEqual(["completed", "flush"]);
  });

  it("parsea el intervalo y cae en el valor por defecto", () => {
    expect(parseWorkerInterval("5000", 2_000)).toBe(5_000);
    expect(parseWorkerInterval("0", 2_000)).toBe(2_000);
    expect(parseWorkerInterval("abc", 2_000)).toBe(2_000);
    expect(parseWorkerInterval(undefined, 2_000)).toBe(2_000);
  });

  it("ejecuta una sola ronda en modo once", async () => {
    const run = vi.fn().mockResolvedValue("ok");

    const result = await runWorkerLoop({
      name: "test",
      intervalMs: 1_000,
      once: true,
      registerSignals: false,
      closePool: false,
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(1);
    expect(result.last).toBe("ok");
  });

  it("sigue corriendo cuando una iteracion falla", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");

    const result = await runWorkerLoop({
      name: "test",
      intervalMs: 1,
      once: true,
      registerSignals: false,
      closePool: false,
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.lastError).toBeInstanceOf(Error);
  });

  it("se detiene despues de la iteracion en curso cuando llega el abort", async () => {
    const controller = new AbortController();
    const run = vi.fn().mockImplementation(async () => {
      controller.abort();
      return "ok";
    });

    const result = await runWorkerLoop({
      name: "test",
      intervalMs: 1_000,
      signal: controller.signal,
      registerSignals: false,
      closePool: false,
      sleep: async () => undefined,
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(1);
  });
});
