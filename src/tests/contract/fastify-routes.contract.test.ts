import { describe, expect, it, vi } from "vitest";

const mockClaim = vi.fn();
const mockReportResult = vi.fn();

vi.mock("@/features/printing/application/print-job.service", () => {
  return {
    PrintJobService: vi.fn(function () {
      return {
        claim: mockClaim,
        reportResult: mockReportResult,
      };
    }),
  };
});

vi.mock("@/db", () => ({
  runtimePool: {
    query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
  },
}));

vi.mock("@/lib/outbox/outbox-metrics", () => ({
  readOutboxMetrics: vi.fn().mockResolvedValue({
    pendingCount: 0,
    deadLetterCount: 0,
    oldestPendingSeconds: 0,
  }),
}));

import { buildFastifyServer } from "@/fastify/server";

describe("Fastify Extracted Routes Contract Test", () => {
  it("GET /api/health/live returns 200 with correlation id", async () => {
    const app = await buildFastifyServer();
    const res = await app.inject({
      method: "GET",
      url: "/api/health/live",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-correlation-id"]).toBeDefined();
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeSeconds).toBe("number");
  });

  it("GET /api/health/ready returns 200 when dependencies are healthy", async () => {
    process.env.OBJECT_STORAGE_BUCKET = "bucket";
    process.env.MERCADOPAGO_CLIENT_ID = "client";

    const app = await buildFastifyServer();
    const res = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(Array.isArray(body.checks)).toBe(true);
  });

  it("POST /api/v1/print/jobs/claim requires authorization header", async () => {
    const app = await buildFastifyServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/print/jobs/claim",
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("POST /api/v1/print/jobs/claim returns 204 when no job is pending", async () => {
    mockClaim.mockResolvedValueOnce(null);

    const app = await buildFastifyServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/print/jobs/claim",
      headers: {
        authorization: "Bearer kp_test_token_123",
      },
    });

    expect(res.statusCode).toBe(204);
    expect(mockClaim).toHaveBeenCalledWith("kp_test_token_123", expect.any(String));
  });

  it("POST /api/v1/print/jobs/:jobId/result requires idempotency-key header", async () => {
    const app = await buildFastifyServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/print/jobs/11111111-1111-4111-8111-111111111111/result",
      headers: {
        authorization: "Bearer kp_test_token_123",
      },
      payload: { status: "printed" },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("POST /api/v1/print/jobs/:jobId/result reports result with idempotency key", async () => {
    mockReportResult.mockResolvedValueOnce({
      jobId: "11111111-1111-4111-8111-111111111111",
      status: "printed",
    });

    const app = await buildFastifyServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/print/jobs/11111111-1111-4111-8111-111111111111/result",
      headers: {
        authorization: "Bearer kp_test_token_123",
        "idempotency-key": "desktop:11111111-1111-4111-8111-111111111111:1",
      },
      payload: { status: "printed" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("printed");
    expect(mockReportResult).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "kp_test_token_123",
        jobId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "desktop:11111111-1111-4111-8111-111111111111:1",
      }),
    );
  });
});
