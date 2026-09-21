type AttemptRecord = {
  failures: number;
  windowStart: number;
};

export class DiscountRateLimiter {
  private readonly attempts = new Map<string, AttemptRecord>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 60_000,
  ) {}

  checkRateLimit(
    key: string,
    now: number = Date.now(),
  ): { allowed: boolean; retryAfterSeconds: number } {
    const record = this.attempts.get(key);
    if (!record) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (now - record.windowStart > this.windowMs) {
      this.attempts.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (record.failures >= this.maxFailures) {
      const remainingMs = this.windowMs - (now - record.windowStart);
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordFailure(key: string, now: number = Date.now()): void {
    const record = this.attempts.get(key);
    if (!record || now - record.windowStart > this.windowMs) {
      this.attempts.set(key, { failures: 1, windowStart: now });
    } else {
      record.failures += 1;
    }
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  reset(): void {
    this.attempts.clear();
  }
}

export const globalDiscountRateLimiter = new DiscountRateLimiter();
