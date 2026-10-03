import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import type { Connections } from '../src/database/connections.js';

const config = readConfig({
  NODE_ENV: 'test',
  CLIENT_URL: 'https://app.strangely.example',
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'split-deployment-test-secret-at-least-thirty-two-characters',
});
const connections = () =>
  ({
    redis: { isReady: false, eval: vi.fn() },
    db: { query: vi.fn() },
  }) as unknown as Connections;

describe('separate frontend and API origins', () => {
  it('keeps rate-limit responses readable only by the configured frontend', async () => {
    const app = await createApp(config, connections());
    try {
      const responses = await Promise.all(
        Array.from({ length: 120 }, () =>
          app.inject({
            url: '/api/presence',
            headers: { origin: config.CLIENT_URL },
          }),
        ),
      );
      const limited = responses.find((response) => response.statusCode === 429);
      expect(limited).toBeDefined();
      expect(limited!.headers['access-control-allow-origin']).toBe(
        config.CLIENT_URL,
      );
      expect(limited!.headers['access-control-allow-credentials']).toBe('true');
      expect(limited!.json()).toHaveProperty('code', 'RATE_LIMIT');
    } finally {
      await app.close();
    }
  });
  it('allows credentialed preflight only for the configured frontend', async () => {
    const app = await createApp(config, connections());
    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/session',
        headers: {
          origin: config.CLIENT_URL,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(
        config.CLIENT_URL,
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers.vary).toBe('Origin');
      expect(response.headers['set-cookie']).toBeUndefined();
      const presence = await app.inject({
        url: '/api/presence',
        headers: { origin: config.CLIENT_URL },
      });
      expect(presence.statusCode).toBe(200);
      expect(presence.headers['access-control-allow-origin']).toBe(
        config.CLIENT_URL,
      );
      expect(presence.headers['cache-control']).toBe('no-store');
      expect(presence.json()).toEqual({ activeUsers: 0 });
    } finally {
      await app.close();
    }
  });

  it('rejects foreign origins and unsupported preflight methods or headers', async () => {
    const app = await createApp(config, connections());
    try {
      for (const origin of [
        'https://evil.example',
        `${config.CLIENT_URL}.evil.example`,
      ]) {
        const response = await app.inject({
          method: 'OPTIONS',
          url: '/api/session',
          headers: {
            origin,
            'access-control-request-method': 'POST',
          },
        });
        expect(response.statusCode).toBe(403);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      }
      for (const headers of [
        { 'access-control-request-method': 'DELETE' },
        {
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,authorization',
        },
      ]) {
        const response = await app.inject({
          method: 'OPTIONS',
          url: '/api/session',
          headers: { origin: config.CLIENT_URL, ...headers },
        });
        expect(response.statusCode).toBe(403);
      }
    } finally {
      await app.close();
    }
  });

  it('keeps error responses readable by the UI and never serves a frontend bundle', async () => {
    const app = await createApp(config, connections());
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { origin: config.CLIENT_URL },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(response.headers['access-control-allow-origin']).toBe(
        config.CLIENT_URL,
      );
      const root = await app.inject('/');
      expect(root.statusCode).toBe(404);
      expect(root.headers['content-type']).toContain('application/json');
    } finally {
      await app.close();
    }
  });
});
