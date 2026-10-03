import { describe, expect, it, vi } from 'vitest';
import { TrafficBudget } from '../src/security/traffic-budget.js';
import { packetBudgetGuard } from '../src/realtime/packet-budget.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import type { Connections } from '../src/database/connections.js';

describe('cheap traffic budgets precede dependency work', () => {
  it('limits both valid and malformed/unknown packet floods before downstream authorization', () => {
    const budget = new TrafficBudget(120, 8, 1, 120_000, () => 1000);
    const disconnect = vi.fn();
    const authorizeDatabase = vi.fn();
    const reply = vi.fn();
    const middleware = packetBudgetGuard(disconnect, budget);
    for (let i = 0; i < 1000; i += 1)
      middleware(
        i % 2 ? ['queue:join', {}, reply] : ['unknown:event', null, reply],
        authorizeDatabase,
      );
    expect(authorizeDatabase).toHaveBeenCalledTimes(120);
    expect(disconnect).toHaveBeenCalledTimes(880);
    expect(reply).toHaveBeenLastCalledWith(
      expect.objectContaining({ ok: false, code: 'RATE_LIMIT' }),
    );
  });
  it('refills at the configured speed and caps/evicts expired network identities', () => {
    let now = 0;
    const budget = new TrafficBudget(2, 1, 3, 5000, () => now);
    expect(budget.consume('a').allowed).toBe(true);
    expect(budget.consume('a').allowed).toBe(true);
    expect(budget.consume('a')).toEqual({ allowed: false, retryAfterMs: 1000 });
    now = 1000;
    expect(budget.consume('a').allowed).toBe(true);
    for (let i = 0; i < 1000; i += 1) budget.consume(`identity-${i}`);
    expect(budget.size).toBe(3);
    now = 10_000;
    expect(budget.consume('new').allowed).toBe(true);
    expect(budget.size).toBe(1);
  });
  it('returns HTTP429 for malformed POST and readiness floods before expensive handlers', async () => {
    const config = readConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost',
      SESSION_SECRET: 'unit-test-secret-with-at-least-thirty-two-characters',
    });
    const database = vi.fn().mockRejectedValue(new Error('unavailable'));
    const ping = vi.fn().mockRejectedValue(new Error('unavailable'));
    const redisRate = vi.fn();
    const connections = {
      db: { query: database },
      redis: { isReady: false, ping, eval: redisRate },
    } as unknown as Connections;
    const app = await createApp(config, connections);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      for (let i = 0; i < 100; i += 1) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/session',
          headers: { origin: config.CLIENT_URL },
          payload: { adult: false },
        });
        expect(response.statusCode).toBe(400);
      }
      const malformed = await app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { origin: config.CLIENT_URL },
        payload: { adult: false },
      });
      expect(malformed.statusCode).toBe(429);
      const readiness = await app.inject({
        method: 'GET',
        url: '/api/health/ready',
      });
      expect(readiness.statusCode).toBe(429);
      expect(readiness.headers['retry-after']).toBe('1');
      expect(database).not.toHaveBeenCalled();
      expect(ping).not.toHaveBeenCalled();
      expect(redisRate).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
      await app.close();
    }
  });
});
