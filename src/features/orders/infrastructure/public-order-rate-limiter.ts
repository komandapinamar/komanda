type CounterRecord = {
  count: number;
  windowStart: number;
};

/**
 * Lightweight in-memory sliding-window counter for public order-creation
 * endpoints. Best-effort per runtime instance; fronted by platform-level
 * protections in production.
 */
export class PublicOrderRateLimiter {
  private readonly counters = new Map<string, CounterRecord>();

  constructor(
    private readonly maxRequests = 20,
    private readonly windowMs = 60 * 60_000,
  ) {}

  checkRateLimit(
    key: string,
    now: number = Date.now(),
  ): { allowed: boolean; retryAfterSeconds: number } {
    const record = this.counters.get(key);
    if (!record || now - record.windowStart > this.windowMs) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= this.maxRequests) {
      const remainingMs = this.windowMs - (now - record.windowStart);
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  record(key: string, now: number = Date.now()): void {
    const record = this.counters.get(key);
    if (!record || now - record.windowStart > this.windowMs) {
      this.counters.set(key, { count: 1, windowStart: now });
    } else {
      record.count += 1;
    }
  }

  reset(): void {
    this.counters.clear();
  }
}

export const globalCashOrderRateLimiter = new PublicOrderRateLimiter();

export class PublicRateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Demasiadas solicitudes. Intente nuevamente más tarde.");
    this.name = "PublicRateLimitExceededError";
  }
}
