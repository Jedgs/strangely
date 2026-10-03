import type { FastifyInstance } from 'fastify';
import { consentSchema, emptySchema } from '../../../shared/protocol.js';
import type { Config } from '../config/env.js';
import type { BanService } from '../moderation/bans.js';
import { ServiceError } from '../security/errors.js';
import { privateReference } from '../security/identity.js';
import type { RateLimiter } from '../security/rate-limit.js';
import { SESSION_COOKIE, type SessionService } from './service.js';
import { AGE_COOKIE } from './provider-age.js';

export function registerSessionRoutes(
  app: FastifyInstance,
  config: Config,
  sessions: SessionService,
  bans: BanService,
  rates: RateLimiter,
): void {
  app.post('/api/session/end', async (request, reply) => {
    if (!emptySchema.safeParse(request.body).success)
      throw new ServiceError(
        'INVALID_REQUEST',
        'Please check your request and try again.',
      );
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await rates.check(
        'session-end',
        privateReference(config, 'network', request.ip),
        30,
        60_000,
      );
      try {
        await sessions.revoke(token);
      } catch (error) {
        if (
          !(error instanceof ServiceError) ||
          (error.status !== 401 && error.code !== 'AGE_REQUIRED')
        )
          throw error;
      }
    }
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
    });
    return { ok: true };
  });
  app.post('/api/session', async (request, reply) => {
    const parsed = consentSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ServiceError(
        'CONSENT_REQUIRED',
        'Please accept all required notices to continue.',
      );
    const ipRef = privateReference(config, 'network', request.ip);
    await rates.check('session-create', ipRef, 10, 60_000);
    await bans.assertAllowed(ipRef);
    // Retain the anonymous identity across consent retries; do not manufacture new
    // identities while an existing socket still owns a valid session.
    let existing;
    if (request.cookies[SESSION_COOKIE]) {
      try {
        existing = await sessions.authenticate(request.cookies[SESSION_COOKIE]);
      } catch (error) {
        if (
          !(error instanceof ServiceError) ||
          (error.status !== 401 && error.code !== 'AGE_REQUIRED')
        )
          throw error;
      }
    }
    if (existing) {
      await bans.assertAllowed(existing.ipRef, existing.sessionRef);
      return sessions.info(existing);
    }
    const { token, session } = await sessions.create(
      parsed.data,
      request.ip,
      request.cookies[AGE_COOKIE],
    );
    if (config.AGE_MODE === 'provider')
      reply.clearCookie(AGE_COOKIE, { path: '/api' });
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: config.SESSION_TTL_SECONDS,
    });
    return sessions.info(session);
  });
  app.get('/api/session', async (request) => {
    const session = await sessions.authenticate(
      request.cookies[SESSION_COOKIE],
    );
    await bans.assertAllowed(
      session.ipRef,
      session.sessionRef,
      privateReference(config, 'network', request.ip),
    );
    await rates.check('session-info', session.sessionRef, 30, 60_000);
    return sessions.info(session);
  });
}
