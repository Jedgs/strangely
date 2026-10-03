export interface BudgetDecision {
  allowed: boolean;
  retryAfterMs: number;
}
interface Bucket {
  tokens: number;
  updatedAt: number;
  expiresAt: number;
}

// A cheap process-local guard protects validation and datastore calls. Redis
// feature limits still enforce quotas. Keys expire opportunistically and the
// LRU cap bounds memory even during an attack with many distinct identities.
export class TrafficBudget {
  private readonly buckets = new Map<string, Bucket>();
  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly maximumKeys = 2048,
    private readonly idleExpiryMs = 120_000,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (
      capacity < 1 ||
      refillPerSecond <= 0 ||
      maximumKeys < 1 ||
      idleExpiryMs < 1
    )
      throw new Error('Invalid traffic budget policy');
  }
  get size(): number {
    return this.buckets.size;
  }
  consume(key: string): BudgetDecision {
    const now = this.now();
    // At most eight evictions per packet; work is bounded independently of
    // cardinality. Recency order is also expiry order for a fixed idle timeout.
    for (let i = 0; i < 8; i += 1) {
      const oldest = this.buckets.entries().next().value;
      if (!oldest || oldest[1].expiresAt > now) break;
      this.buckets.delete(oldest[0]);
    }
    const previous = this.buckets.get(key);
    const tokens =
      previous && previous.expiresAt > now
        ? Math.min(
            this.capacity,
            previous.tokens +
              (Math.max(0, now - previous.updatedAt) * this.refillPerSecond) /
                1000,
          )
        : this.capacity;
    const allowed = tokens >= 1;
    this.buckets.delete(key);
    if (this.buckets.size >= this.maximumKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
    this.buckets.set(key, {
      tokens: allowed ? tokens - 1 : tokens,
      updatedAt: now,
      expiresAt: now + this.idleExpiryMs,
    });
    return {
      allowed,
      retryAfterMs: allowed
        ? 0
        : Math.max(1, Math.ceil(((1 - tokens) * 1000) / this.refillPerSecond)),
    };
  }
}
