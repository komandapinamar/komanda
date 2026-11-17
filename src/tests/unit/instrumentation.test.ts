import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  load: vi.fn(),
  init: vi.fn(),
  shutdown: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ loadRuntimeConfig: calls.load }));
vi.mock("@/lib/observability/telemetry", () => ({
  initializeTelemetry: calls.init,
  shutdownTelemetry: calls.shutdown,
}));

import { register } from "@/instrumentation";

describe("Next instrumentation", () => {
  beforeEach(() => {
    calls.load.mockReset();
    calls.init.mockReset().mockResolvedValue(undefined);
    calls.shutdown.mockReset().mockResolvedValue(undefined);
  });

  it("validates configuration before initializing telemetry", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("OTEL_SERVICE_NAME", "komanda-fastify");

    await register();

    expect(calls.load).toHaveBeenCalledWith({ role: "web" });
    expect(calls.init).toHaveBeenCalledWith("komanda-fastify");
    expect(calls.load.mock.invocationCallOrder[0]).toBeLessThan(
      calls.init.mock.invocationCallOrder[0],
    );
  });

  it("does nothing outside the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(calls.load).not.toHaveBeenCalled();
    expect(calls.init).not.toHaveBeenCalled();
  });
});
