import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/search/route";
import { globalSearchRateLimiter } from "@/features/search/infrastructure/search-rate-limiter";

describe("Contract: GET /api/v1/search", () => {
  it("returns 200 OK with empty collections on empty or whitespace query without scanning DB", async () => {
    globalSearchRateLimiter.reset();
    const request = new Request("https://komanda.app/api/v1/search?q=", {
      headers: { "x-forwarded-for": "192.168.1.10" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      success: true,
      data: {
        query: "",
        products: [],
        businesses: [],
      },
      error: null,
    });
  });

  it("returns 400 Bad Request when productsLimit exceeds maximum limit of 50", async () => {
    globalSearchRateLimiter.reset();
    const request = new Request(
      "https://komanda.app/api/v1/search?q=test&productsLimit=100",
      {
        headers: { "x-forwarded-for": "192.168.1.11" },
      },
    );

    const response = await GET(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 Bad Request when query exceeds 80 characters", async () => {
    globalSearchRateLimiter.reset();
    const longQuery = "a".repeat(85);
    const request = new Request(
      `https://komanda.app/api/v1/search?q=${longQuery}`,
      {
        headers: { "x-forwarded-for": "192.168.1.12" },
      },
    );

    const response = await GET(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 429 Too Many Requests when IP sends more than 30 requests in a minute", async () => {
    globalSearchRateLimiter.reset();
    const testIp = "203.0.113.42";

    // First 30 requests succeed
    for (let i = 1; i <= 30; i++) {
      const req = new Request("https://komanda.app/api/v1/search?q=", {
        headers: { "x-forwarded-for": testIp },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    }

    // 31st request triggers 429
    const burstReq = new Request("https://komanda.app/api/v1/search?q=", {
      headers: { "x-forwarded-for": testIp },
    });
    const burstRes = await GET(burstReq);

    expect(burstRes.status).toBe(429);
    expect(burstRes.headers.get("Retry-After")).toBeDefined();

    const body = await burstRes.json();
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many search requests. Please try again later.",
      },
    });

    globalSearchRateLimiter.reset();
  });
});
