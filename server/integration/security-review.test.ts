import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, scryptSync } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { readConfig } from '../src/config/env.js';
import { createConnections } from '../src/database/connections.js';
import { createApp } from '../src/app.js';
import { CONSENT_VERSION } from '../../shared/protocol.js';
import { privateReference } from '../src/security/identity.js';
import { ProviderAgeService } from '../src/session/provider-age.js';
import { AdminRepository } from '../src/admin/repository.js';
import { randomUUID } from 'node:crypto';
import { SCRYPT_OPTIONS } from '../src/admin/credentials.js';

test(
  'real stores: operator access, blocking, logout and one-use age assurance',
  { timeout: 45000 },
  async (t) => {
    if (
      !process.env.INTEGRATION_DATABASE_URL ||
      !process.env.INTEGRATION_REDIS_URL
    ) {
      t.skip('Requires isolated migrated PostgreSQL and Redis.');
      return;
    }
    const password = 'isolated-test-operator-passphrase';
    const salt = 'ef'.repeat(16);
    const config = readConfig({
      ...process.env,
      NODE_ENV: 'test',
      MAX_ACTIVE_SESSIONS: '1',
      DATABASE_URL: process.env.INTEGRATION_DATABASE_URL,
      REDIS_URL: process.env.INTEGRATION_REDIS_URL,
      AGE_MODE: 'development',
      ADMIN_TOTP_SECRET: '',
      ADMIN_PASSWORD_HASH: `scrypt$32768$8$3$${salt}$${scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString('hex')}`,
    });
    const connections = createConnections(config);
    await connections.redis.connect();
    const app = await createApp(config, connections);
    let socket: Socket | undefined;
    const consent = {
      adult: true,
      terms: true,
      guidelines: true,
      privacy: true,
      version: CONSENT_VERSION,
    };
    const request = (
      path: string,
      method: 'GET' | 'POST' = 'GET',
      payload?: unknown,
      cookie = '',
    ) =>
      app.inject({
        method,
        url: path,
        headers: { origin: config.CLIENT_URL, cookie },
        ...(payload === undefined ? {} : { payload }),
      });
    try {
      await app.listen({ host: '127.0.0.1', port: 0 });
      const address = app.server.address();
      assert.ok(address && typeof address === 'object');
      assert.equal((await request('/api/admin/overview')).statusCode, 401);
      const denied = await request('/api/admin/login', 'POST', {
        password: 'invalid-passphrase-only',
        otp: '',
      });
      assert.equal(denied.statusCode, 401);
      const logged = await request('/api/admin/login', 'POST', {
        password,
        otp: '',
      });
      assert.equal(logged.statusCode, 200);
      const adminCookie = String(logged.headers['set-cookie']).split(';')[0]!;
      assert.match(String(logged.headers['set-cookie']), /HttpOnly/);
      assert.match(String(logged.headers['set-cookie']), /SameSite=Strict/);
      const started = await request('/api/session', 'POST', consent);
      assert.equal(started.statusCode, 200);
      const sessionId = started.json().sessionId as string;
      const chatCookie = String(started.headers['set-cookie']).split(';')[0]!;
      assert.equal(
        (await request('/api/admin/overview', 'GET', undefined, chatCookie))
          .statusCode,
        401,
      );
      socket = io(`http://127.0.0.1:${address.port}`, {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: config.CLIENT_URL, cookie: chatCookie },
      });
      await new Promise<void>((resolve, reject) => {
        socket!.once('session:ready', () => resolve());
        socket!.once('connect_error', () =>
          reject(new Error('Synthetic chat socket failed')),
        );
        socket!.connect();
      });
      const overview = await request(
        '/api/admin/overview',
        'GET',
        undefined,
        adminCookie,
      );
      assert.equal(overview.statusCode, 200);
      assert.equal(overview.json().activeCount, 1);
      const user = overview.json().users[0];
      assert.equal(user.country, null);
      assert.equal(
        user.sessionRef,
        privateReference(config, 'session', sessionId),
      );
      assert.ok(!overview.body.includes(chatCookie));
      assert.ok(!overview.body.includes('127.0.0.1'));
      const extra = await request('/api/session', 'POST', consent);
      const extraCookie = String(extra.headers['set-cookie']).split(';')[0]!;
      const overflow = io(`http://127.0.0.1:${address.port}`, {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: config.CLIENT_URL, cookie: extraCookie },
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Capacity rejection timed out.')),
            4000,
          );
          overflow.once('connect_error', (error) => {
            clearTimeout(timer);
            try {
              assert.equal(error.data?.code, 'SESSION_CAPACITY');
              resolve();
            } catch (failure) {
              reject(failure);
            }
          });
          overflow.once('connect', () => {
            clearTimeout(timer);
            reject(new Error('Exceeded the configured session ceiling.'));
          });
          overflow.connect();
        });
      } finally {
        overflow.disconnect();
      }
      const disconnected = new Promise<void>((resolve) =>
        socket!.once('disconnect', () => resolve()),
      );
      const restricted = await request(
        '/api/admin/ban',
        'POST',
        {
          targetRef: user.sessionRef,
          scope: 'session',
          hours: 1,
          reason: 'Isolated security integration review',
        },
        adminCookie,
      );
      assert.equal(restricted.statusCode, 200);
      await disconnected;
      assert.equal(
        (await request('/api/session', 'GET', undefined, chatCookie))
          .statusCode,
        403,
      );
      const audit = await connections.db.query(
        "SELECT code FROM security_events WHERE code='ADMIN_BAN' AND session_ref=$1",
        [user.sessionRef],
      );
      assert.equal(audit.rowCount, 1);
      const ban = await connections.db.query(
        'SELECT id FROM bans WHERE target_ref=$1 AND revoked_at IS NULL',
        [user.sessionRef],
      );
      assert.equal(
        (
          await request(
            '/api/admin/bans/revoke',
            'POST',
            { id: ban.rows[0].id, reason: 'End of isolated integration check' },
            adminCookie,
          )
        ).statusCode,
        200,
      );
      assert.equal(
        (await request('/api/session', 'GET', undefined, chatCookie))
          .statusCode,
        200,
      );
      assert.equal(
        (await request('/api/session/end', 'POST', {}, chatCookie)).statusCode,
        200,
      );
      assert.equal(
        (await request('/api/session', 'GET', undefined, chatCookie))
          .statusCode,
        401,
      );
      assert.equal(
        (await request('/api/admin/logout', 'POST', {}, adminCookie))
          .statusCode,
        200,
      );
      assert.equal(
        (await request('/api/admin/overview', 'GET', undefined, adminCookie))
          .statusCode,
        401,
      );
      const ageConfig = {
        ...config,
        AGE_MODE: 'provider' as const,
        AGE_VERIFICATION_URL: 'https://gateway.example/start',
        AGE_WEBHOOK_SECRET:
          'test-only-signed-age-webhook-at-least-thirty-two-characters',
      };
      const provider = new ProviderAgeService(ageConfig, connections.redis);
      const challenge = await provider.start('test:browser');
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac('sha256', ageConfig.AGE_WEBHOOK_SECRET)
        .update(`${timestamp}\n${challenge.challenge}\nadult`)
        .digest('hex');
      await provider.resolve({
        challenge: challenge.challenge,
        adultVerified: true,
        timestamp,
        signature,
      });
      assert.equal(
        await provider.status(challenge.challenge, 'test:browser'),
        'verified',
      );
      assert.equal(
        (
          await provider.assess(
            consent as Parameters<ProviderAgeService['assess']>[0],
            { challenge: challenge.challenge, ip: 'test:other-browser' },
          )
        ).adultAllowed,
        false,
      );
      assert.equal(
        (
          await provider.assess(
            consent as Parameters<ProviderAgeService['assess']>[0],
            { challenge: challenge.challenge, ip: 'test:browser' },
          )
        ).adultAllowed,
        true,
      );
      assert.equal(
        (
          await provider.assess(
            consent as Parameters<ProviderAgeService['assess']>[0],
            { challenge: challenge.challenge, ip: 'test:browser' },
          )
        ).adultAllowed,
        false,
      );
      await assert.rejects(
        provider.resolve({
          challenge: challenge.challenge,
          adultVerified: true,
          timestamp,
          signature,
        }),
      );
      const pageIds = Array.from({ length: 80 }, () => randomUUID());
      await connections.db.query(
        `INSERT INTO security_events(id,created_at,severity,code,expires_at) SELECT id,NOW()+INTERVAL '1 minute','info','PAGE_TEST',NOW()+INTERVAL '1 day' FROM UNNEST($1::uuid[]) AS records(id)`,
        [pageIds],
      );
      const repository = new AdminRepository(connections.db, config);
      const first = await repository.overview();
      assert.ok(first.nextBefore);
      const second = await repository.overview(
        first.nextBefore.at,
        first.nextBefore.id,
      );
      const seen = [...first.events, ...second.events]
        .filter((event) => event.code === 'PAGE_TEST')
        .map((event) => event.id);
      assert.equal(
        new Set(seen).size,
        80,
        'Keyset pagination must preserve PostgreSQL timestamp precision and never skip equal-time events.',
      );
    } finally {
      socket?.disconnect();
      await app.close();
      connections.redis.destroy();
      await connections.db.end();
    }
  },
);
