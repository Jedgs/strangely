import { scryptSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import type { Connections } from '../src/database/connections.js';
import { AdminAuthService } from '../src/admin/auth.js';
import {
  verifyPassword,
  verifyTotp,
  totp,
  SCRYPT_OPTIONS,
} from '../src/admin/credentials.js';
import { AuditService } from '../src/security/audit.js';
import { AdminRepository } from '../src/admin/repository.js';

const password = 'test-only-operator-passphrase';
const salt = 'ab'.repeat(16);
const hash = `scrypt$32768$8$3$${salt}$${scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString('hex')}`;
const config = readConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'test-secret-only-at-least-thirty-two-characters',
  ADMIN_PASSWORD_HASH: hash,
});
function redisFixture() {
  const values = new Map<string, string>();
  return {
    isReady: true,
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(
      async (key: string, value: string, options?: { NX?: boolean }) => {
        if (options?.NX && values.has(key)) return null;
        values.set(key, value);
        return 'OK';
      },
    ),
    del: vi.fn(async (key: string) => values.delete(key)),
    values,
  };
}

describe('operator authentication and authorization', () => {
  it('bounds simultaneous password hashing before expensive crypto work', async () => {
    const auth = new AdminAuthService(
      config,
      redisFixture() as unknown as Connections['redis'],
    );
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => auth.login(password, '')),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    expect(
      results.filter(
        (result) =>
          result.status === 'rejected' && result.reason.code === 'RATE_LIMIT',
      ),
    ).toHaveLength(8);
  });
  it('verifies a salted scrypt hash and rejects incorrect/malformed credentials', async () => {
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(`${password}!`, hash)).toBe(false);
    expect(await verifyPassword(password, 'bad')).toBe(false);
  });
  it('matches the RFC 6238 SHA1 vector and rejects stale/wrong MFA codes', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totp(secret, 1)).toBe('287082');
    expect(verifyTotp(secret, '287082', 59000)).toBe(1);
    expect(verifyTotp(secret, '287082', 159000)).toBeNull();
    expect(verifyTotp(secret, '000000', 59000)).toBeNull();
  });
  it('keeps admin tokens separate, expires through Redis, invalidates on password rotation and revokes logout', async () => {
    const redis = redisFixture();
    const auth = new AdminAuthService(
      config,
      redis as unknown as Connections['redis'],
    );
    await expect(auth.authenticate('a'.repeat(43))).rejects.toMatchObject({
      status: 401,
    });
    const token = await auth.login(password, '');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(redis.set.mock.calls)).not.toContain(token);
    expect(redis.set.mock.calls[0]?.[2]).toEqual({ EX: 1800 });
    await expect(auth.authenticate(token)).resolves.toBeUndefined();
    const rotated = new AdminAuthService(
      { ...config, ADMIN_PASSWORD_HASH: hash.replace(salt, 'cd'.repeat(16)) },
      redis as unknown as Connections['redis'],
    );
    await expect(rotated.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
    await auth.logout(token);
    await expect(auth.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('requires and prevents reuse of an authenticator step', async () => {
    const secret = 'A'.repeat(32);
    const auth = new AdminAuthService(
      { ...config, ADMIN_TOTP_SECRET: secret },
      redisFixture() as unknown as Connections['redis'],
    );
    await expect(auth.login(password, '')).rejects.toMatchObject({
      status: 401,
    });
    const code = totp(secret, Math.floor(Date.now() / 30000));
    await expect(auth.login(password, code)).resolves.toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    await expect(auth.login(password, code)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('never exposes operator routes to unauthenticated or ordinary chat sessions', async () => {
    const connections = {
      redis: redisFixture(),
      db: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    } as unknown as Connections;
    const app = await createApp(config, connections);
    try {
      for (const cookie of ['', `cr_session=${'a'.repeat(43)}`]) {
        const response = await app.inject({
          url: '/api/admin/overview',
          headers: { origin: config.CLIENT_URL, cookie },
        });
        expect(response.statusCode).toBe(401);
        expect(response.body).not.toContain('rows');
      }
      const foreign = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        headers: { origin: 'https://evil.example' },
        payload: { password, otp: '' },
      });
      expect(foreign.statusCode).toBe(403);
      const publicPresence = await app.inject('/api/presence');
      expect(publicPresence.json()).toEqual({ activeUsers: 0 });
      expect(publicPresence.headers['x-frame-options']).toBe('DENY');
    } finally {
      await app.close();
    }
  });
});

describe('bounded audit logging and operator transactions', () => {
  it('deduplicates signals, accepts only reference digests, bounds memory and surfaces failed delivery', async () => {
    const db = {
      query: vi.fn().mockRejectedValue(new Error('private database detail')),
    } as unknown as Connections['db'];
    const audit = new AuditService(db, config);
    for (let index = 0; index < 1000; index++)
      audit.record(
        'HTTP_ORIGIN_REJECTED',
        'warning',
        'raw-ip-do-not-store',
        String(index).padStart(64, '0'),
      );
    expect(audit.status().pending).toBe(500);
    expect(audit.status().dropped).toBe(500);
    await audit.flush();
    expect(audit.status()).toMatchObject({
      failed: true,
      pending: 400,
      dropped: 600,
    });
    expect(JSON.stringify(vi.mocked(db.query).mock.calls)).not.toContain(
      'raw-ip-do-not-store',
    );
    const deduped = new AuditService(db, config);
    for (let index = 0; index < 100; index++)
      deduped.record('HTTP_RATE_LIMIT', 'warning', 'a'.repeat(64));
    expect(deduped.status().pending).toBe(1);
  });
  it('rolls back a ban if its durable audit insert fails', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT EXISTS')) return { rows: [{ known: true }] };
      if (sql.includes('INSERT INTO security_events'))
        throw new Error('audit unavailable');
      return { rows: [] };
    });
    const release = vi.fn();
    const db = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as unknown as Connections['db'];
    await expect(
      new AdminRepository(db, config).ban(
        {
          targetRef: 'a'.repeat(64),
          scope: 'session',
          hours: 24,
          reason: 'Test-only operator review',
        },
        true,
        'b'.repeat(64),
      ),
    ).rejects.toThrow('audit unavailable');
    expect(query.mock.calls.map((call) => call[0])).toContain('ROLLBACK');
    expect(query.mock.calls.map((call) => call[0])).not.toContain('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });
});
