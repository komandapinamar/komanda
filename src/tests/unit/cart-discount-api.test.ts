import { describe, expect, it } from "vitest";
import { DiscountRateLimiter } from "@/features/discounts/infrastructure/discount-rate-limiter";
import {
  CartDiscountIneligibleError,
  RateLimitExceededError,
} from "@/features/cart/application/cart.service";
import { cartErrorResponse } from "@/features/cart/web/cart-http";

describe("Story 2.2: Cart Discount API & Rate Limiting", () => {
  describe("DiscountRateLimiter", () => {
    it("allows attempts up to maxFailures and blocks on exceeding", () => {
      const limiter = new DiscountRateLimiter(5, 60_000);
      const key = "192.168.1.1:burger-joint";
      const start = 1_000_000;

      // First 4 failures are allowed to retry
      for (let i = 1; i <= 4; i++) {
        expect(limiter.checkRateLimit(key, start).allowed).toBe(true);
        limiter.recordFailure(key, start);
      }

      // 5th failure
      expect(limiter.checkRateLimit(key, start).allowed).toBe(true);
      limiter.recordFailure(key, start);

      // 6th check should be blocked
      const check = limiter.checkRateLimit(key, start + 10_000);
      expect(check.allowed).toBe(false);
      expect(check.retryAfterSeconds).toBe(50); // 60s - 10s elapsed
    });

    it("resets block after window expires", () => {
      const limiter = new DiscountRateLimiter(2, 60_000);
      const key = "ip-test:slug";
      const start = 100_000;

      limiter.recordFailure(key, start);
      limiter.recordFailure(key, start);

      expect(limiter.checkRateLimit(key, start).allowed).toBe(false);

      // Check after 61 seconds
      expect(limiter.checkRateLimit(key, start + 61_000).allowed).toBe(true);
    });

    it("clears failures when recordSuccess is called", () => {
      const limiter = new DiscountRateLimiter(3, 60_000);
      const key = "ip-success:slug";
      const start = 100_000;

      limiter.recordFailure(key, start);
      limiter.recordFailure(key, start);
      expect(limiter.checkRateLimit(key, start).allowed).toBe(true);

      limiter.recordSuccess(key);
      // New failures should restart from 1
      limiter.recordFailure(key, start);
      limiter.recordFailure(key, start);
      expect(limiter.checkRateLimit(key, start).allowed).toBe(true);
    });
  });

  describe("Cart HTTP Error Mapping for Discounts", () => {
    it("maps RateLimitExceededError to HTTP 429 with Retry-After header", async () => {
      const error = new RateLimitExceededError(45);
      const response = cartErrorResponse(error, "corr-rate");

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("45");
      const body = await response.json();
      expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("maps CartDiscountIneligibleError to HTTP 422 with problem details", async () => {
      const error = new CartDiscountIneligibleError(
        "MIN_ORDER_NOT_MET",
        "Compra mínima de $5.000 requerida",
      );
      const response = cartErrorResponse(error, "corr-discount");

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("MIN_ORDER_NOT_MET");
      expect(body.detail).toBe("Compra mínima de $5.000 requerida");
    });
  });
});
