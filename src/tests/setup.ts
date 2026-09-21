import { afterEach, beforeAll, vi } from "vitest";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://unit_test:unit_test@localhost:5432/unit_test";

beforeAll(() => {
  process.env.TZ = "UTC";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
