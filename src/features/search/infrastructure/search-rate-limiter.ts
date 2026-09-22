import { SEARCH_CONFIG } from "@/features/search/domain/search.rules";

type RequestRecord = {
  timestamps: number[];
};

export class SearchRateLimiter {
  private readonly clients = new Map<string, RequestRecord>();

  constructor(
    private readonly maxRequests: number = SEARCH_CONFIG.RATE_LIMIT_MAX_REQUESTS,
    private readonly windowMs: number = SEARCH_CONFIG.RATE_LIMIT_WINDOW_MS,
  ) {}

  checkRateLimit(
    key: string,
    now: number = Date.now(),
  ): { allowed: boolean; retryAfterSeconds: number } {
    const record = this.clients.get(key);
    if (!record) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    // Filter out timestamps outside the sliding window
    const validTimestamps = record.timestamps.filter(
      (ts) => now - ts < this.windowMs,
    );
    record.timestamps = validTimestamps;

    if (validTimestamps.length >= this.maxRequests) {
      const oldestTimestamp = validTimestamps[0];
      const remainingMs = this.windowMs - (now - oldestTimestamp);
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordRequest(key: string, now: number = Date.now()): void {
    const record = this.clients.get(key);
    if (!record) {
      this.clients.set(key, { timestamps: [now] });
      return;
    }

    const validTimestamps = record.timestamps.filter(
      (ts) => now - ts < this.windowMs,
    );
    validTimestamps.push(now);
    record.timestamps = validTimestamps;
  }

  reset(): void {
    this.clients.clear();
  }
}

export const globalSearchRateLimiter = new SearchRateLimiter();
