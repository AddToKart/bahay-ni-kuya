// Tiny token-bucket rate limiter for control endpoints.
export interface Bucket {
  tokens: number;
  updated: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private capacity = 10,
    private refillPerSecond = 10 / 60,
  ) {}

  /** Consume one token; returns {ok, retryAfterMs}. */
  take(key: string, now = Date.now()): { ok: boolean; retryAfterMs: number } {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, updated: now };
      this.buckets.set(key, bucket);
    }
    const elapsed = (now - bucket.updated) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.updated = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true, retryAfterMs: 0 };
    }
    const retryAfterMs = Math.ceil(((1 - bucket.tokens) / this.refillPerSecond) * 1000);
    return { ok: false, retryAfterMs };
  }
}
