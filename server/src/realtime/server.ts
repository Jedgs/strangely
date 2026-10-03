import { Server, type Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import type {
  ClientEvents,
  ServerEvents,
  MatchEnded,
  Ack,
} from '../../../shared/protocol.js';
import { emptySchema, matchSchema } from '../../../shared/protocol.js';
import type { Config } from '../config/env.js';
import type { Connections } from '../database/connections.js';
import type { BanService } from '../moderation/bans.js';
import type { RateLimiter } from '../security/rate-limit.js';
import { privateReference } from '../security/identity.js';
import { ServiceError } from '../security/errors.js';
import { validate } from '../security/validation.js';
import {
  SESSION_COOKIE,
  type AnonymousSession,
  type SessionService,
} from '../session/service.js';
import { MatchStore, type EndedMatch } from '../matchmaking/store.js';
import { installSignaling } from './signaling.js';
import { installModeration } from './moderation.js';
import { clientAddress } from '../security/client-address.js';
import { TrafficBudget } from '../security/traffic-budget.js';
import { packetBudgetGuard } from './packet-budget.js';
import type { AuditService } from '../security/audit.js';
import { trustedCountry } from '../security/trusted-country.js';

interface SocketData {
  session: AnonymousSession;
  token: string;
  networkRef: string;
  pending: number;
  serial: Promise<void>;
  connectedAt: string;
  stage: 'ready' | 'waiting' | 'matched';
  country: string | null;
  audit: AuditService;
}
export type ChatSocket = Socket<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  SocketData
>;
export type ChatServer = Server<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  SocketData
>;
export interface RealtimeContext {
  io: ChatServer;
  store: MatchStore;
  rates: RateLimiter;
  config: Config;
  connections: Connections;
  authorize(socket: ChatSocket): Promise<AnonymousSession>;
  ended(
    socket: ChatSocket,
    match: EndedMatch | undefined,
    reason: MatchEnded['reason'],
  ): void;
}

export function ackError(error: unknown): Ack {
  if (error instanceof ServiceError)
    return {
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
    };
  return {
    ok: false,
    code: 'UNAVAILABLE',
    message: 'The service is temporarily unavailable. Please try again.',
  };
}

// Bound outstanding work, serialize each socket, and acknowledge every valid
// event invocation even when validation or dependencies fail.
export function action(
  socket: ChatSocket,
  operation: () => Promise<void>,
  reply: unknown,
): void {
  const respond =
    typeof reply === 'function'
      ? (result: Ack) => {
          try {
            reply(result);
          } catch {
            /* Client may have disconnected. */
          }
        }
      : () => {};
  if (socket.data.pending >= 32) {
    respond({
      ok: false,
      code: 'RATE_LIMIT',
      message: 'Please slow down and try again.',
      retryAfterMs: 1000,
    });
    return;
  }
  socket.data.pending += 1;
  socket.data.serial = socket.data.serial.then(async () => {
    try {
      if (!socket.connected)
        throw new ServiceError(
          'CONNECTION_LOST',
          'Your connection was lost. Please reconnect.',
          409,
        );
      await operation();
      respond({ ok: true });
    } catch (error) {
      if (error instanceof ServiceError)
        socket.data.audit?.record(
          error.code,
          'warning',
          socket.data.networkRef,
          socket.data.session.sessionRef,
        );
      respond(ackError(error));
    } finally {
      socket.data.pending -= 1;
    }
  });
}

export function registerRealtime(
  app: FastifyInstance,
  config: Config,
  connections: Connections,
  sessions: SessionService,
  bans: BanService,
  rates: RateLimiter,
  audit: AuditService,
): ChatServer {
  const origin = new URL(config.CLIENT_URL).origin;
  const connectionBudget = new TrafficBudget(30, 0.5);
  let pendingAuthentications = 0;
  const io: ChatServer = new Server(app.server, {
    maxHttpBufferSize: 65536,
    serveClient: false,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    cors: { origin, credentials: true },
    allowRequest: (request, done) => {
      const ip = clientAddress(
        request.socket.remoteAddress ?? 'unknown',
        request.headers['x-forwarded-for'],
        config.TRUST_PROXY,
      );
      if (request.headers.origin !== origin)
        audit.record(
          'WS_ORIGIN_REJECTED',
          'warning',
          privateReference(config, 'network', ip),
        );
      done(
        null,
        request.headers.origin === origin &&
          io.engine.clientsCount < config.MAX_ACTIVE_SESSIONS + 32 &&
          connectionBudget.consume(privateReference(config, 'network', ip))
            .allowed,
      );
    },
  });
  const store = new MatchStore(connections.redis);
  const context: RealtimeContext = {
    io,
    store,
    rates,
    config,
    connections,
    async authorize(socket) {
      const session = await sessions.authenticate(socket.data.token);
      if (session.id !== socket.data.session.id)
        throw new ServiceError(
          'SESSION_EXPIRED',
          'Your session has expired. Please start again.',
          401,
        );
      await bans.assertAllowed(
        session.ipRef,
        session.sessionRef,
        socket.data.networkRef,
      );
      const expired = await store.heartbeat(session.id, socket.id);
      context.ended(socket, expired, 'expired');
      return session;
    },
    ended(socket, match, reason) {
      if (!match) return;
      socket.data.stage = 'ready';
      const peer = match.peerOwner
        ? io.sockets.sockets.get(match.peerOwner)
        : undefined;
      if (peer) peer.data.stage = 'ready';
      socket.emit('match:ended', { matchId: match.matchId, reason });
      if (match.peerOwner)
        io.to(match.peerOwner).emit('match:ended', {
          matchId: match.matchId,
          reason,
        });
    },
  };
  io.use((socket, next) => {
    if (
      io.sockets.sockets.size + pendingAuthentications >=
        config.MAX_ACTIVE_SESSIONS ||
      pendingAuthentications >= 32
    ) {
      const error = new Error(
        'The chat service is busy. Please try again shortly.',
      ) as Error & { data: Ack };
      error.data = {
        ok: false,
        code: 'SESSION_CAPACITY',
        message: error.message,
        retryAfterMs: 5000,
      };
      audit.record('WS_CAPACITY', 'warning');
      next(error);
      setImmediate(() => socket.conn.close());
      return;
    }
    pendingAuthentications++;
    void (async () => {
      const ip = clientAddress(
        socket.handshake.address,
        socket.handshake.headers['x-forwarded-for'],
        config.TRUST_PROXY,
      );
      const networkRef = privateReference(config, 'network', ip);
      await rates.check('socket-connect', networkRef, 30, 60_000);
      const token = app.parseCookie(socket.handshake.headers.cookie ?? '')[
        SESSION_COOKIE
      ];
      const session = await sessions.authenticate(token);
      await bans.assertAllowed(session.ipRef, session.sessionRef, networkRef);
      if (socket.conn.readyState !== 'open')
        throw new ServiceError(
          'CONNECTION_LOST',
          'Your connection was lost. Please reconnect.',
          409,
        );
      const ended = await store.claim(session.id, socket.id);
      socket.data = {
        session,
        token: token!,
        networkRef,
        pending: 0,
        serial: Promise.resolve(),
        connectedAt: new Date().toISOString(),
        stage: 'ready',
        country: trustedCountry(config, socket.handshake.headers),
        audit,
      };
      context.ended(socket, ended, 'disconnect');
      // A transport can close during asynchronous middleware without emitting
      // Socket.IO's connected-socket disconnect event. Release any late claim.
      if (socket.conn.readyState !== 'open') {
        await store.disconnect(session.id, socket.id);
        throw new ServiceError(
          'CONNECTION_LOST',
          'Your connection was lost. Please reconnect.',
          409,
        );
      }
      next();
    })()
      .catch((error) => {
        audit.record(
          error instanceof ServiceError ? error.code : 'WS_AUTH_FAILURE',
          'warning',
          privateReference(
            config,
            'network',
            clientAddress(
              socket.handshake.address,
              socket.handshake.headers['x-forwarded-for'],
              config.TRUST_PROXY,
            ),
          ),
        );
        const ack = ackError(error);
        const safe = new Error(
          ack.ok ? 'Connection failed.' : ack.message,
        ) as Error & { data: Ack };
        safe.data = ack;
        next(safe);
        setImmediate(() => socket.conn.close());
      })
      .finally(() => {
        pendingAuthentications--;
      });
  });
  io.on('connection', (socket) => {
    audit.record(
      'SESSION_CONNECTED',
      'info',
      socket.data.networkRef,
      socket.data.session.sessionRef,
    );
    const knownEvents = new Set([
      'queue:join',
      'queue:next',
      'queue:stop',
      'signal:description',
      'signal:ice',
      'moderation:report',
      'moderation:block',
    ]);
    // Socket middleware receives every event, including unknown names and
    // malformed payloads, before any handler can access PostgreSQL or Redis.
    socket.use(
      packetBudgetGuard(() => {
        audit.record(
          'WS_PACKET_FLOOD',
          'warning',
          socket.data.networkRef,
          socket.data.session.sessionRef,
        );
        socket.emit('session:ended', {
          message: 'Too many requests. Please reconnect in a moment.',
        });
        socket.disconnect(true);
      }),
    );
    socket.use((packet, next) => {
      if (!knownEvents.has(String(packet[0]))) {
        audit.record(
          'WS_UNKNOWN_EVENT',
          'warning',
          socket.data.networkRef,
          socket.data.session.sessionRef,
        );
        next(new Error('Unsupported event'));
        return;
      }
      next();
    });
    socket.emit('session:ready', { sessionId: socket.data.session.id });
    const join = async () => {
      const joined = await store.join(socket.data.session.id, socket.id);
      if (joined.kind === 'waiting') {
        socket.data.stage = 'waiting';
        socket.emit('queue:waiting');
        return;
      }
      const peer = io.sockets.sockets.get(joined.peerOwner);
      try {
        if (!peer?.connected)
          throw new ServiceError(
            'MATCH_ENDED',
            'That conversation has ended.',
            409,
          );
        await context.authorize(peer);
        // The peer may have pressed Stop while the SQL ban check was pending.
        await store.peer(socket.data.session.id, socket.id, joined.matchId);
      } catch (error) {
        context.ended(
          socket,
          await store.leave(socket.data.session.id, socket.id, joined.matchId),
          'expired',
        );
        throw error;
      }
      peer.emit('match:found', { matchId: joined.matchId, initiator: true });
      socket.data.stage = 'matched';
      peer.data.stage = 'matched';
      socket.emit('match:found', { matchId: joined.matchId, initiator: false });
    };
    socket.on('queue:join', (payload, reply) =>
      action(
        socket,
        async () => {
          validate(emptySchema, payload);
          const session = await context.authorize(socket);
          await rates.check('queue', session.sessionRef, 12, 60_000);
          await rates.check(
            'queue-network',
            socket.data.networkRef,
            60,
            60_000,
          );
          await join();
        },
        reply,
      ),
    );
    socket.on('queue:next', (payload, reply) =>
      action(
        socket,
        async () => {
          const { matchId } = validate(matchSchema, payload);
          const session = await context.authorize(socket);
          await rates.check('queue', session.sessionRef, 12, 60_000);
          await rates.check(
            'queue-network',
            socket.data.networkRef,
            60,
            60_000,
          );
          context.ended(
            socket,
            await store.leave(session.id, socket.id, matchId),
            'next',
          );
          await join();
        },
        reply,
      ),
    );
    socket.on('queue:stop', (payload, reply) =>
      action(
        socket,
        async () => {
          validate(emptySchema, payload);
          const session = await context.authorize(socket);
          await rates.check('stop', session.sessionRef, 30, 60_000);
          context.ended(
            socket,
            await store.leave(session.id, socket.id),
            'stop',
          );
        },
        reply,
      ),
    );
    installSignaling(socket, context);
    installModeration(socket, context);
    socket.on('disconnect', () => {
      audit.record(
        'SESSION_DISCONNECTED',
        'info',
        socket.data.networkRef,
        socket.data.session.sessionRef,
      );
      // Disconnect is ordered after queued actions; its Lua ownership comparison
      // cannot remove a later owner, queue membership or conversation.
      socket.data.serial = socket.data.serial.then(async () => {
        try {
          context.ended(
            socket,
            await store.disconnect(socket.data.session.id, socket.id),
            'disconnect',
          );
        } catch {
          /* Lease expiry and a future heartbeat recover unavailable Redis. */
        }
      });
    });
  });
  let ticking = false;
  const heartbeat = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void (async () => {
      await Promise.all(
        [...io.sockets.sockets.values()].map((socket) => {
          const task = socket.data.serial.then(async () => {
            try {
              await context.authorize(socket);
            } catch {
              socket.emit('session:ended', {
                message: 'Your session could not be renewed. Please reconnect.',
              });
              socket.disconnect(true);
            }
          });
          socket.data.serial = task;
          return task;
        }),
      );
      await store.prune();
    })()
      .catch(() => {})
      .finally(() => {
        ticking = false;
      });
  }, 15_000);
  heartbeat.unref();
  app.addHook('preClose', (done) => {
    clearInterval(heartbeat);
    io.close(() => done());
  });
  return io;
}
