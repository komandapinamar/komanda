import http from "node:http";
import { describe, expect, it, vi } from "vitest";

const mockClaim = vi.fn();
const mockReportResult = vi.fn();
const mockEventsAfter = vi.fn().mockResolvedValue([]);

vi.mock("@/features/orders/application/order-query.service", () => {
  return {
    OrderQueryService: vi.fn(function () {
      return {
        eventsAfter: mockEventsAfter,
      };
    }),
  };
});

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

  it("GET /api/v1/tenants/:tenantId/orders/events establishes SSE stream with headers and initial events", async () => {
    mockEventsAfter.mockResolvedValueOnce([
      {
        id: "evt-1",
        orderId: "ord-1",
        sequence: "1",
        eventType: "order.transitioned",
        fromStatus: "pending",
        toStatus: "preparing",
        metadata: {},
        occurredAt: "2026-09-02T14:30:00.000Z",
      },
    ]);

    const app = await buildFastifyServer();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 3001;

    const dataPromise = new Promise<string>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/tenants/11111111-1111-4111-8111-111111111111/orders/events`,
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers["content-type"]).toContain("text/event-stream");
          expect(res.headers["x-correlation-id"]).toBeDefined();

          let buffer = "";
          res.on("data", (chunk) => {
            buffer += chunk.toString();
            if (buffer.includes("event: order")) {
              req.destroy();
              resolve(buffer);
            }
          });
        },
      );
      req.on("error", (err) => {
        // req.destroy() causes ECONNRESET or similar abort, which is expected
        if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") {
          reject(err);
        }
      });
    });

    const received = await dataPromise;
    expect(received).toContain("retry: 2000");
    expect(received).toContain("id: 1");
    expect(received).toContain("event: order");
    await app.close();
  });
});
