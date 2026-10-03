import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import type { Config } from './config/env.js';
import type { Connections } from './database/connections.js';
import { BanService } from './moderation/bans.js';
import { RateLimiter } from './security/rate-limit.js';
import {
  SelfDeclaredAgeProvider,
  type AgeAssuranceProvider,
} from './session/age-assurance.js';
import { SessionService } from './session/service.js';
import { registerSessionRoutes } from './session/routes.js';
import { ServiceError } from './security/errors.js';
import { registerRealtime } from './realtime/server.js';
import { registerPresenceRoute } from './realtime/presence.js';
import { TrafficBudget } from './security/traffic-budget.js';
import { privateReference } from './security/identity.js';
import { AuditService } from './security/audit.js';
import { ProviderAgeService } from './session/provider-age.js';
import { registerAgeRoutes } from './session/age-routes.js';
import { registerAdminRoutes } from './admin/routes.js';

export async function createApp(
  config: Config,
  connections: Connections,
  age?: AgeAssuranceProvider,
) {
  const app = Fastify({
    bodyLimit: 8192,
    trustProxy: config.TRUST_PROXY,
    logger: false,
  });
  await app.register(helmet, {
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  const audit = new AuditService(connections.db, config);
  const auditTimer = setInterval(() => void audit.flush(), 2000);
  auditTimer.unref();
  app.addHook('onClose', async () => {
    clearInterval(auditTimer);
    await audit.flush();
  });
  const apiBudget = new TrafficBudget(100, 10);
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      const origin = request.headers.origin;
      const clientOrigin = new URL(config.CLIENT_URL).origin;
      reply.header('Vary', 'Origin');
      if (origin === clientOrigin) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
      }
      const traffic = apiBudget.consume(
        privateReference(config, 'network', request.ip),
      );
      if (!traffic.allowed) {
        audit.record(
          'HTTP_RATE_LIMIT',
          'warning',
          privateReference(config, 'network', request.ip),
        );
        reply.header(
          'Retry-After',
          String(Math.ceil(traffic.retryAfterMs / 1000)),
        );
        return reply.code(429).send({
          error: 'Too many requests. Please wait a moment and try again.',
          code: 'RATE_LIMIT',
        });
      }
      if (
        (origin && origin !== clientOrigin) ||
        (request.method !== 'GET' &&
          !origin &&
          !(request.method === 'POST' && request.url === '/api/age/result'))
      ) {
        audit.record(
          'HTTP_ORIGIN_REJECTED',
          'warning',
          privateReference(config, 'network', request.ip),
        );
        return reply.code(403).send({ error: 'This request is not allowed.' });
      }
      // Credentialed cross-origin REST requests from the single configured UI.
      // Socket.IO applies the same exact-origin policy to polling and upgrades.
      if (request.method === 'OPTIONS') {
        const method = request.headers['access-control-request-method'];
        const headers = request.headers['access-control-request-headers'];
        if (
          !['GET', 'POST'].includes(method ?? '') ||
          (headers &&
            headers
              .split(',')
              .some((name) => name.trim().toLowerCase() !== 'content-type'))
        )
          return reply
            .code(403)
            .send({ error: 'This request is not allowed.' });
        reply.header('Access-Control-Allow-Methods', 'GET, POST');
        reply.header('Access-Control-Allow-Headers', 'Content-Type');
        reply.header('Access-Control-Max-Age', '600');
        return reply.code(204).send();
      }
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const code =
      error instanceof ServiceError ? error.code : 'HTTP_REQUEST_ERROR';
    audit.record(
      code,
      error instanceof ServiceError && error.status < 500
        ? 'warning'
        : 'critical',
      privateReference(config, 'network', request.ip),
    );
    if (error instanceof ServiceError) {
      if (error.retryAfterMs)
        reply.header(
          'Retry-After',
          String(Math.ceil(error.retryAfterMs / 1000)),
        );
      return reply
        .code(error.status)
        .send({ error: error.message, code: error.code });
    }
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status =
      typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
        ? statusCode
        : 500;
    reply.code(status).send({
      error:
        status === 500
          ? 'The service is temporarily unavailable. Please try again.'
          : 'Please check your request and try again.',
    });
  });
  const provider = new ProviderAgeService(config, connections.redis);
  const sessions = new SessionService(
    config,
    connections.redis,
    age ??
      (config.AGE_MODE === 'provider'
        ? provider
        : new SelfDeclaredAgeProvider()),
  );
  const bans = new BanService(connections.db);
  const rates = new RateLimiter(connections.redis);
  registerSessionRoutes(app, config, sessions, bans, rates);
  const realtime = registerRealtime(
    app,
    config,
    connections,
    sessions,
    bans,
    rates,
    audit,
  );
  registerPresenceRoute(app, realtime);
  registerAgeRoutes(app, config, provider, rates);
  registerAdminRoutes(app, config, connections, realtime, rates, audit);
  app.get('/api/health/live', async () => ({ status: 'ok' }));
  app.get('/api/health/ready', async (_request, reply) => {
    try {
      await Promise.all([
        connections.db.query('SELECT 1'),
        connections.redis.ping(),
      ]);
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'This page could not be found.' }),
  );
  return app;
}
