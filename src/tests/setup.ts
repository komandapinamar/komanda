import { afterEach, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.TZ = "UTC";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
