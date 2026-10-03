import type { FastifyInstance } from 'fastify';
import {
  adminLoginSchema,
  adminBanSchema,
  adminReviewSchema,
  adminRevokeSchema,
  adminPageSchema,
} from '../../../shared/admin.js';
import type { Config } from '../config/env.js';
import type { Connections } from '../database/connections.js';
import { privateReference } from '../security/identity.js';
import { emptySchema } from '../../../shared/protocol.js';
import type { RateLimiter } from '../security/rate-limit.js';
import type { AuditService } from '../security/audit.js';
import type { ChatServer } from '../realtime/server.js';
import { validate } from '../security/validation.js';
import { AdminAuthService } from './auth.js';
import { AdminRepository } from './repository.js';

export function registerAdminRoutes(
  app: FastifyInstance,
  config: Config,
  connections: Connections,
  io: ChatServer,
  rates: RateLimiter,
  audit: AuditService,
): void {
  const auth = new AdminAuthService(config, connections.redis);
  const repository = new AdminRepository(connections.db, config);
  const options = {
    path: '/',
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 1800,
  };
  // A plugin-scoped hook guards every operator endpoint, including future ones.
  void app.register(async (scope) => {
    scope.addHook('preHandler', async (request) => {
      const network = privateReference(config, 'network', request.ip);
      if (request.url.split('?')[0] === '/api/admin/login') {
        await rates.check('admin-login', network, 8, 900_000);
        await rates.check('admin-login-global', 'operator', 100, 900_000);
      } else {
        await auth.authenticate(request.cookies[auth.cookieName()]);
        await rates.check('admin-actions', network, 120, 60_000);
      }
    });
    scope.post('/api/admin/login', async (request, reply) => {
      const input = validate(adminLoginSchema, request.body);
      const token = await auth.login(input.password, input.otp);
      audit.record(
        'ADMIN_LOGIN',
        'critical',
        privateReference(config, 'network', request.ip),
      );
      reply.setCookie(auth.cookieName(), token, options);
      return { authenticated: true, expiresInSeconds: 1800 };
    });
    scope.post('/api/admin/logout', async (request, reply) => {
      validate(emptySchema, request.body);
      await auth.logout(request.cookies[auth.cookieName()]!);
      reply.clearCookie(auth.cookieName(), options);
      return { ok: true };
    });
    scope.get('/api/admin/overview', async (request) => {
      const page = validate(adminPageSchema, request.query);
      const users = [...io.sockets.sockets.values()]
        .slice(0, 100)
        .map((socket) => ({
          sessionRef: socket.data.session.sessionRef,
          networkRef: socket.data.networkRef,
          connectedAt: socket.data.connectedAt,
          state: socket.data.stage,
          country: socket.data.country,
          assurance: socket.data.session.assurance,
        }));
      return {
        ...(await repository.overview(page.before, page.beforeId)),
        activeCount: io.sockets.sockets.size,
        users,
        audit: audit.status(),
        ageMode: config.AGE_MODE,
      };
    });
    scope.post('/api/admin/ban', async (request) => {
      const input = validate(adminBanSchema, request.body);
      const targets = [...io.sockets.sockets.values()].filter(
        (socket) =>
          input.targetRef ===
          (input.scope === 'session'
            ? socket.data.session.sessionRef
            : socket.data.networkRef),
      );
      await repository.ban(
        input,
        targets.length > 0,
        privateReference(config, 'network', request.ip),
      );
      for (const socket of targets) {
        socket.emit('session:ended', {
          message: 'This session has been restricted by the operator.',
        });
        socket.disconnect(true);
      }
      return { ok: true, disconnected: targets.length };
    });
    scope.post('/api/admin/reports/review', async (request) => {
      const input = validate(adminReviewSchema, request.body);
      await repository.review(
        input.id,
        input.status,
        privateReference(config, 'network', request.ip),
      );
      return { ok: true };
    });
    scope.post('/api/admin/bans/revoke', async (request) => {
      const input = validate(adminRevokeSchema, request.body);
      await repository.revoke(
        input.id,
        input.reason,
        privateReference(config, 'network', request.ip),
      );
      return { ok: true };
    });
  });
}
