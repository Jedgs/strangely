import type { Connections } from '../database/connections.js';
import { ServiceError, unavailable } from './errors.js';

// INCR and expiry must be one atomic operation, including the first request.
const RATE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

export class RateLimiter {
  constructor(private readonly redis: Connections['redis']) {}
  async check(
    scope: string,
    reference: string,
    maximum: number,
    windowMs: number,
  ): Promise<void> {
    if (!this.redis.isReady) throw unavailable();
    let result: unknown;
    try {
      result = await this.redis.eval(RATE_SCRIPT, {
        keys: [`cr:rate:${scope}:${reference}`],
        arguments: [String(windowMs)],
      });
    } catch {
      throw unavailable();
    }
    const [count, remaining] = result as [number, number];
    if (count > maximum)
      throw new ServiceError(
        'RATE_LIMIT',
        'Please wait a moment before trying again.',
        429,
        Math.max(remaining, 1),
      );
  }
}
