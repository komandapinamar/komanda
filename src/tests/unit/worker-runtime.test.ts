import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  runtimePool: { end: vi.fn().mockResolvedValue(undefined) },
}));

const { runWorkerLoop, parseWorkerInterval } = await import(
  "@/workers/runtime/worker-runtime"
);

describe("runtime de workers", () => {
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
