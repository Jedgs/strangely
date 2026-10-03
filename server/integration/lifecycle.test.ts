import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io as connectSocket, type Socket } from 'socket.io-client';
import {
  CONSENT_VERSION,
  type Ack,
  type MatchFound,
} from '../../shared/protocol.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import { createConnections } from '../src/database/connections.js';
import { MatchStore, type JoinedQueue } from '../src/matchmaking/store.js';
import { SelfDeclaredAgeProvider } from '../src/session/age-assurance.js';
import { SessionService } from '../src/session/service.js';
import { privateReference } from '../src/security/identity.js';
import { RateLimiter } from '../src/security/rate-limit.js';
import { ReportService } from '../src/moderation/reports.js';
import { BanService } from '../src/moderation/bans.js';

const consent = {
  adult: true,
  terms: true,
  guidelines: true,
  privacy: true,
  version: CONSENT_VERSION,
} as const;

test(
  'live PostgreSQL/Redis and two-client lifecycle invariants',
  { timeout: 45_000 },
  async (t) => {
    // Dedicated URLs are required because the suite intentionally manipulates its
    // own leases and queues. Never flush or use a live application's datastore.
    if (
      !process.env.INTEGRATION_DATABASE_URL ||
      !process.env.INTEGRATION_REDIS_URL
    ) {
      t.skip(
        'NOT YET VERIFIED: configure isolated INTEGRATION_DATABASE_URL and INTEGRATION_REDIS_URL, then migrate the test database.',
      );
      return;
    }
    const config = readConfig({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: process.env.INTEGRATION_DATABASE_URL,
      REDIS_URL: process.env.INTEGRATION_REDIS_URL,
      SESSION_SECRET:
        process.env.SESSION_SECRET ??
        'isolated-integration-secret-minimum-thirty-two-characters',
    });
    const connections = createConnections(config);
    const availability = await Promise.allSettled([
      connections.db.query('SELECT 1'),
      Promise.race([
        connections.redis.connect(),
        delay(4000).then(() => {
          throw new Error('Redis unavailable');
        }),
      ]),
    ]);
    if (availability.some((result) => result.status === 'rejected')) {
      if (connections.redis.isOpen) connections.redis.destroy();
      await connections.db.end();
      t.skip(
        'NOT YET VERIFIED: isolated PostgreSQL or Redis is unavailable. No matchmaking assertions ran.',
      );
      return;
    }
    const tables = await connections.db.query<{
      reports: string | null;
      bans: string | null;
    }>(
      "SELECT to_regclass('moderation_reports')::text AS reports, to_regclass('bans')::text AS bans",
    );
    if (!tables.rows[0]?.reports || !tables.rows[0]?.bans) {
      connections.redis.destroy();
      await connections.db.end();
      t.skip(
        'NOT YET VERIFIED: run migrations on the isolated test database first.',
      );
      return;
    }
    const sessions = new SessionService(
      config,
      connections.redis,
      new SelfDeclaredAgeProvider(),
    );
    const store = new MatchStore(connections.redis);
    const created: Awaited<ReturnType<SessionService['create']>>[] = [];
    const keys = new Set<string>();
    const matchIds = new Set<string>();
    const clients: Socket[] = [];
    let app: Awaited<ReturnType<typeof createApp>> | undefined;
    const provision = async () => {
      const entry = await sessions.create(consent, `test:${randomUUID()}`);
      created.push(entry);
      for (const key of [
        `cr:session:${entry.session.id}`,
        `cr:token:${privateReference(config, 'token', entry.token)}`,
        `cr:lease:${entry.session.id}`,
        `cr:current:${entry.session.id}`,
      ])
        keys.add(key);
      return entry;
    };
    const remember = (result: JoinedQueue) => {
      if (result.kind === 'match') matchIds.add(result.matchId);
    };
    try {
      assert.equal(
        await connections.redis.zCard('cr:queue'),
        0,
        'Use an isolated idle Redis database for integration tests.',
      );
      await t.test(
        'concurrent joins create one match per participant and queue entries are unique',
        async () => {
          const users = await Promise.all(
            Array.from({ length: 12 }, () => provision()),
          );
          await Promise.all(
            users.map((user, index) =>
              store.claim(user.session.id, `owner-${index}`),
            ),
          );
          const joins = await Promise.all(
            users.map((user, index) =>
              store.join(user.session.id, `owner-${index}`),
            ),
          );
          joins.forEach(remember);
          assert.equal(
            joins.filter((result) => result.kind === 'match').length,
            6,
          );
          assert.equal(await connections.redis.zCard('cr:queue'), 0);
          const current = await Promise.all(
            users.map((user) =>
              connections.redis.get(`cr:current:${user.session.id}`),
            ),
          );
          const counts = new Map<string, number>();
          for (const id of current) {
            assert.ok(id);
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
          assert.equal(counts.size, 6);
          for (const count of counts.values()) assert.equal(count, 2);
          await Promise.all(
            users.map((user, index) =>
              store.disconnect(user.session.id, `owner-${index}`),
            ),
          );
          const waiting = await provision();
          await store.claim(waiting.session.id, 'waiting-owner');
          await Promise.all(
            Array.from({ length: 20 }, () =>
              store.join(waiting.session.id, 'waiting-owner'),
            ),
          );
          assert.equal(await connections.redis.zCard('cr:queue'), 1);
          await store.disconnect(waiting.session.id, 'waiting-owner');
        },
      );
      await t.test(
        'old disconnect cannot remove replacement ownership or queue membership',
        async () => {
          const user = await provision();
          await store.claim(user.session.id, 'old-owner');
          await assert.rejects(
            () => store.claim(user.session.id, 'parallel-owner'),
            { code: 'SESSION_IN_USE' },
          );
          await connections.redis.del(`cr:lease:${user.session.id}`);
          await store.claim(user.session.id, 'new-owner');
          await store.join(user.session.id, 'new-owner');
          await store.disconnect(user.session.id, 'old-owner');
          assert.equal(
            await connections.redis.get(`cr:lease:${user.session.id}`),
            'new-owner',
          );
          assert.notEqual(
            await connections.redis.zScore('cr:queue', user.session.id),
            null,
          );
          await store.disconnect(user.session.id, 'new-owner');
        },
      );
      await t.test(
        'witness authorization, block exclusion, report dedup and bans use persistent constraints',
        async () => {
          const [a, b] = await Promise.all([provision(), provision()]);
          await store.claim(a.session.id, 'owner-a');
          await store.claim(b.session.id, 'owner-b');
          await store.join(a.session.id, 'owner-a');
          const matched = await store.join(b.session.id, 'owner-b');
          assert.equal(matched.kind, 'match');
          if (matched.kind !== 'match') return;
          remember(matched);
          const witness = await store.recentPeer(
            a.session.id,
            'owner-a',
            matched.matchId,
          );
          assert.equal(witness.peerRef, b.session.sessionRef);
          await assert.rejects(
            () => store.recentPeer(a.session.id, 'owner-a', randomUUID()),
            { code: 'MATCH_ENDED' },
          );
          const reports = new ReportService(connections.db, config);
          await Promise.all(
            Array.from({ length: 5 }, () =>
              reports.submit(
                {
                  matchId: matched.matchId,
                  reason: 'other',
                  description: 'Integration report',
                },
                a.session.sessionRef,
                witness.peerRef,
              ),
            ),
          );
          const count = await connections.db.query<{ count: string }>(
            'SELECT COUNT(*)::text AS count FROM moderation_reports WHERE match_id = $1 AND reporter_ref = $2',
            [matched.matchId, a.session.sessionRef],
          );
          assert.equal(count.rows[0]?.count, '1');
          await store.leave(a.session.id, 'owner-a', matched.matchId);
          await store.join(a.session.id, 'owner-a');
          const rematched = await store.join(b.session.id, 'owner-b');
          assert.equal(rematched.kind, 'match');
          if (rematched.kind !== 'match') return;
          remember(rematched);
          assert.notEqual(rematched.matchId, matched.matchId);
          const blocked = await store.block(
            a.session.id,
            'owner-a',
            matched.matchId,
          );
          assert.equal(
            blocked?.matchId,
            rematched.matchId,
            'Blocking an old witness must end a newer conversation with the same participant.',
          );
          keys.add(`cr:block:${a.session.id}:${b.session.id}`);
          keys.add(`cr:block:${b.session.id}:${a.session.id}`);
          assert.equal(
            await connections.redis.get(`cr:current:${a.session.id}`),
            null,
          );
          assert.equal(
            (await store.join(a.session.id, 'owner-a')).kind,
            'waiting',
          );
          assert.equal(
            (await store.join(b.session.id, 'owner-b')).kind,
            'waiting',
          );
          assert.equal(await connections.redis.zCard('cr:queue'), 2);
          await store.disconnect(b.session.id, 'owner-b');
          const c = await provision();
          await store.claim(c.session.id, 'owner-c');
          const unrelated = await store.join(c.session.id, 'owner-c');
          assert.equal(unrelated.kind, 'match');
          if (unrelated.kind !== 'match') return;
          remember(unrelated);
          assert.equal(
            await store.block(a.session.id, 'owner-a', matched.matchId),
            undefined,
          );
          assert.equal(
            await connections.redis.get(`cr:current:${a.session.id}`),
            unrelated.matchId,
            'Blocking an old witness must preserve a conversation with a different participant.',
          );
          await connections.db.query(
            "INSERT INTO bans (id, target_ref, reason, expires_at) VALUES ($1, $2, 'Integration restriction', NOW() + INTERVAL '1 minute')",
            [randomUUID(), b.session.sessionRef],
          );
          await assert.rejects(
            () =>
              new BanService(connections.db).assertAllowed(
                b.session.sessionRef,
              ),
            { code: 'BANNED' },
          );
          await store.disconnect(a.session.id, 'owner-a');
          await store.disconnect(c.session.id, 'owner-c');
        },
      );
      await t.test(
        'atomic concurrent rate limits permit exactly the configured quota',
        async () => {
          const ref = randomUUID();
          keys.add(`cr:rate:integration:${ref}`);
          const results = await Promise.allSettled(
            Array.from({ length: 50 }, () =>
              new RateLimiter(connections.redis).check(
                'integration',
                ref,
                10,
                60_000,
              ),
            ),
          );
          assert.equal(
            results.filter((result) => result.status === 'fulfilled').length,
            10,
          );
          assert.ok(
            (await connections.redis.pTTL(`cr:rate:integration:${ref}`)) > 0,
          );
        },
      );
      await t.test(
        'two real Socket.IO clients receive authorized matches, safe acks, signaling and disconnect cleanup',
        async () => {
          app = await createApp(config, connections);
          await app.listen({ port: 0, host: '127.0.0.1' });
          const address = app.server.address();
          assert.ok(address && typeof address === 'object');
          const url = `http://127.0.0.1:${address.port}`;
          const [a, b] = await Promise.all([provision(), provision()]);
          async function connected(token: string) {
            const client = connectSocket(url, {
              transports: ['websocket'],
              reconnection: false,
              timeout: 4000,
              extraHeaders: {
                Origin: new URL(config.CLIENT_URL).origin,
                Cookie: `cr_session=${token}`,
              },
            });
            clients.push(client);
            await new Promise<void>((resolve, reject) => {
              client.once('connect', resolve);
              client.once('connect_error', reject);
            });
            return client;
          }
          const [ca, cb] = await Promise.all([
            connected(a.token),
            connected(b.token),
          ]);
          const request = (client: Socket, event: string, payload: unknown) =>
            new Promise<Ack>((resolve, reject) =>
              client
                .timeout(5000)
                .emit(event, payload, (error: Error | null, ack: Ack) =>
                  error ? reject(error) : resolve(ack),
                ),
            );
          const once = <T>(client: Socket, event: string): Promise<T> =>
            new Promise((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error(`Event ${event} did not arrive`)),
                5000,
              );
              client.once(event, (value) => {
                clearTimeout(timer);
                resolve(value as T);
              });
            });
          const foundA = once<MatchFound>(ca, 'match:found');
          const foundB = once<MatchFound>(cb, 'match:found');
          assert.deepEqual(await request(ca, 'queue:join', {}), { ok: true });
          assert.deepEqual(await request(cb, 'queue:join', {}), { ok: true });
          const [ma, mb] = await Promise.all([foundA, foundB]);
          matchIds.add(ma.matchId);
          assert.equal(ma.matchId, mb.matchId);
          assert.notEqual(ma.initiator, mb.initiator);
          const forged = await request(ca, 'signal:ice', {
            matchId: randomUUID(),
            candidate: { candidate: '' },
          });
          assert.equal(forged.ok, false);
          const received = once<{ matchId: string }>(cb, 'signal:ice');
          assert.deepEqual(
            await request(ca, 'signal:ice', {
              matchId: ma.matchId,
              candidate: { candidate: '' },
            }),
            { ok: true },
          );
          assert.equal((await received).matchId, ma.matchId);
          const ended = once<{ matchId: string }>(cb, 'match:ended');
          ca.disconnect();
          assert.equal((await ended).matchId, ma.matchId);
          assert.equal(
            await connections.redis.get(`cr:current:${b.session.id}`),
            null,
          );
          cb.disconnect();
        },
      );
    } finally {
      clients.forEach((client) => client.disconnect());
      if (app) await app.close();
      const refs = created.map((entry) => entry.session.sessionRef);
      if (refs.length) {
        await connections.db.query(
          'DELETE FROM moderation_reports WHERE reporter_ref = ANY($1::text[])',
          [refs],
        );
        await connections.db.query(
          'DELETE FROM bans WHERE target_ref = ANY($1::text[])',
          [refs],
        );
      }
      for (const entry of created) {
        await connections.redis.zRem('cr:queue', entry.session.id);
        for (const id of matchIds)
          keys.add(`cr:witness:${entry.session.id}:${id}`);
      }
      for (const id of matchIds) keys.add(`cr:match:${id}`);
      if (keys.size) await connections.redis.del([...keys]);
      connections.redis.destroy();
      await connections.db.end();
    }
  },
);
