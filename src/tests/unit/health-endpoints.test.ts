import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRuntimePoolQuery, mockReadOutboxMetrics } = vi.hoisted(() => ({
  mockRuntimePoolQuery: vi.fn(),
  mockReadOutboxMetrics: vi.fn(),
}));

vi.mock("@/db", () => ({
  runtimePool: {
    query: mockRuntimePoolQuery,
  },
}));

vi.mock("@/lib/outbox/outbox-metrics", () => ({
  readOutboxMetrics: mockReadOutboxMetrics,
}));

import {
  collectLiveness,
  collectReadiness,
  checkDatabaseHealth,
  checkOutboxHealth,
  checkPrintingHealth,
} from "@/lib/observability/health";

describe("Health Checks (Liveness, Readiness, Outbox & Printing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collectLiveness returns status ok with uptime", () => {
    const liveness = collectLiveness();
    expect(liveness.status).toBe("ok");
    expect(typeof liveness.uptimeSeconds).toBe("number");
    expect(liveness.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("checkDatabaseHealth succeeds when select 1 succeeds", async () => {
    mockRuntimePoolQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const result = await checkDatabaseHealth();
    expect(result.status).toBe("ok");
    expect(result.name).toBe("database");
  });

  it("checkDatabaseHealth returns down with error detail when select 1 fails", async () => {
    mockRuntimePoolQuery.mockRejectedValueOnce(new Error("Connection refused"));
    const result = await checkDatabaseHealth();
    expect(result.status).toBe("down");
    expect(result.detail).toContain("Connection refused");
  });

  it("checkOutboxHealth reports ok when backlog is normal", async () => {
    mockReadOutboxMetrics.mockResolvedValueOnce({
      pendingCount: 5,
      deadLetterCount: 0,
      oldestPendingSeconds: 10,
    });
    const result = await checkOutboxHealth();
    expect(result.status).toBe("ok");
    expect(result.name).toBe("outbox");
  });

  it("checkOutboxHealth reports degraded when DLQ or lag exceeds thresholds", async () => {
    mockReadOutboxMetrics.mockResolvedValueOnce({
      pendingCount: 150,
      deadLetterCount: 60,
      oldestPendingSeconds: 400,
    });
    const result = await checkOutboxHealth();
    expect(result.status).toBe("degraded");
    expect(result.detail).toContain("Outbox backlog");
  });

  it("checkPrintingHealth queries print_jobs table", async () => {
    mockRuntimePoolQuery.mockResolvedValueOnce({ rows: [] });
    const result = await checkPrintingHealth();
    expect(result.status).toBe("ok");
    expect(result.name).toBe("printing");
  });

  it("collectReadiness returns overall ok when all checks pass", async () => {
    process.env.OBJECT_STORAGE_BUCKET = "test-bucket";
    process.env.MERCADOPAGO_CLIENT_ID = "test-client";
    mockRuntimePoolQuery.mockResolvedValue({ rows: [] });
    mockReadOutboxMetrics.mockResolvedValue({
      pendingCount: 0,
      deadLetterCount: 0,
      oldestPendingSeconds: 0,
    });

    const readiness = await collectReadiness();
    expect(readiness.status).toBe("ok");
  });
});
