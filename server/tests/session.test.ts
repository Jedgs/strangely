import { describe, expect, it, vi } from 'vitest';
import { consentSchema, CONSENT_VERSION } from '../../shared/protocol.js';
import { readConfig } from '../src/config/env.js';
import type { Connections } from '../src/database/connections.js';
import { createApp } from '../src/app.js';
import { SelfDeclaredAgeProvider } from '../src/session/age-assurance.js';
import { SessionService } from '../src/session/service.js';
import { makeIceServers } from '../src/webrtc/ice.js';
import { RateLimiter } from '../src/security/rate-limit.js';

const config = readConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'unit-test-secret-with-at-least-thirty-two-characters',
});
const consent = {
  adult: true,
  terms: true,
  guidelines: true,
  privacy: true,
  version: CONSENT_VERSION,
} as const;

function unavailableConnections(): Connections {
  return {
    redis: {
      isReady: false,
      eval: vi.fn(),
      ping: vi.fn().mockRejectedValue(new Error('private driver detail')),
    },
    db: {
      query: vi.fn().mockRejectedValue(new Error('private driver detail')),
    },
  } as unknown as Connections;
}

describe('anonymous consent and boundary checks', () => {
  it('requires every consent, correct version and no unexpected fields', () => {
    expect(consentSchema.safeParse(consent).success).toBe(true);
    expect(consentSchema.safeParse({ ...consent, adult: false }).success).toBe(
      false,
    );
    expect(
      consentSchema.safeParse({ ...consent, privacy: undefined }).success,
    ).toBe(false);
    expect(
      consentSchema.safeParse({ ...consent, version: 'stale' }).success,
    ).toBe(false);
    expect(
      consentSchema.safeParse({ ...consent, verified: true }).success,
    ).toBe(false);
  });
  it('explicitly identifies the age declaration as self declared', async () => {
    expect(await new SelfDeclaredAgeProvider().assess(consent)).toEqual({
      adultAllowed: true,
      assurance: 'self-declared',
    });
  });
  it('fails authentication and creation when Redis is unavailable', async () => {
    const service = new SessionService(
      config,
      unavailableConnections().redis,
      new SelfDeclaredAgeProvider(),
    );
    await expect(service.authenticate('a'.repeat(43))).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: 503,
    });
    await expect(service.create(consent, '127.0.0.1')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(service.authenticate(undefined)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('rejects mutation origins, invalid consent and returns safe service errors', async () => {
    const app = await createApp(config, unavailableConnections());
    try {
      for (const origin of [
        undefined,
        'http://evil.example',
        'http://localhost:5173.evil.example',
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/session',
          headers: origin ? { origin } : {},
          payload: consent,
        });
        expect(response.statusCode).toBe(403);
      }
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { origin: config.CLIENT_URL },
        payload: { ...consent, adult: false },
      });
      expect(invalid.statusCode).toBe(400);
      const offline = await app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { origin: config.CLIENT_URL },
        payload: consent,
      });
      expect(offline.statusCode).toBe(503);
      expect(offline.body).not.toContain('private driver detail');
      expect(offline.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });
  it('uses an opaque random token and stores only its digest reference', async () => {
    const evalMock = vi.fn().mockResolvedValue(1);
    const redis = {
      isReady: true,
      eval: evalMock,
    } as unknown as Connections['redis'];
    const created = await new SessionService(
      config,
      redis,
      new SelfDeclaredAgeProvider(),
    ).create(consent, '203.0.113.42');
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.session.id).toMatch(/^[a-f0-9-]{36}$/);
    const serialized = JSON.stringify(evalMock.mock.calls);
    expect(serialized).not.toContain(created.token);
    expect(serialized).not.toContain('203.0.113.42');
    expect(created.session.expiresAt).toBeGreaterThan(Date.now());
  });
  it('sets the HTTP-only strict cookie and returns only public session information', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce([1, 60_000])
      .mockResolvedValueOnce(1);
    const connections = {
      redis: { isReady: true, eval: evaluate },
      db: { query: vi.fn().mockResolvedValue({ rows: [{ banned: false }] }) },
    } as unknown as Connections;
    const app = await createApp(config, connections);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { origin: config.CLIENT_URL },
        payload: consent,
      });
      expect(response.statusCode).toBe(200);
      const cookie = String(response.headers['set-cookie']);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain(`Max-Age=${config.SESSION_TTL_SECONDS}`);
      expect(cookie).toContain('Path=/');
      const info = response.json();
      expect(info.sessionId).toMatch(/^[a-f0-9-]{36}$/);
      expect(info.face.intervalMs).toBe(config.FACE_INTERVAL_MS);
      expect(info).not.toHaveProperty('token');
      expect(info).not.toHaveProperty('ipRef');
      expect(info).not.toHaveProperty('sessionRef');
      expect(response.body).not.toContain(config.SESSION_SECRET);
    } finally {
      await app.close();
    }
  });
  it('rejects an expired session even if a Redis lookup returns a stale record', async () => {
    const redis = {
      isReady: true,
      get: vi
        .fn()
        .mockResolvedValueOnce('session-id')
        .mockResolvedValueOnce(
          JSON.stringify({ id: 'session-id', expiresAt: Date.now() - 1 }),
        ),
    } as unknown as Connections['redis'];
    const service = new SessionService(
      config,
      redis,
      new SelfDeclaredAgeProvider(),
    );
    await expect(service.authenticate('a'.repeat(43))).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
    });
  });
  it('generates finite TURN credentials without exposing the signing secret', () => {
    const turnConfig = {
      ...config,
      TURN_SERVER_URL: 'turn:localhost:3478',
      TURN_SHARED_SECRET: 'turn-secret-that-is-at-least-thirty-two-chars',
    };
    const servers = makeIceServers(turnConfig, 'public-id', 1_000_000);
    expect(servers[1]?.username).toBe('4600:public-id');
    expect(servers[1]?.credential).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(JSON.stringify(servers)).not.toContain(
      turnConfig.TURN_SHARED_SECRET,
    );
  });
  it('returns the atomic rate counter expiry as a retry delay', async () => {
    const redis = {
      isReady: true,
      eval: vi.fn().mockResolvedValue([11, 40_000]),
    } as unknown as Connections['redis'];
    await expect(
      new RateLimiter(redis).check('test', 'reference', 10, 60_000),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT', retryAfterMs: 40_000 });
  });
});
