import type { FastifyInstance } from 'fastify';
import { emptySchema } from '../../../shared/protocol.js';
import type { Config } from '../config/env.js';
import type { RateLimiter } from '../security/rate-limit.js';
import { privateReference } from '../security/identity.js';
import { validate } from '../security/validation.js';
import { ServiceError } from '../security/errors.js';
import {
  AGE_COOKIE,
  ageResultSchema,
  type ProviderAgeService,
} from './provider-age.js';

export function registerAgeRoutes(
  app: FastifyInstance,
  config: Config,
  provider: ProviderAgeService,
  rates: RateLimiter,
) {
  app.get('/api/age/status', async (request) =>
    config.AGE_MODE === 'provider'
      ? {
          required: true,
          status: await provider.status(
            request.cookies[AGE_COOKIE],
            request.ip,
          ),
        }
      : { required: false, status: 'development' },
  );
  app.post('/api/age/start', async (request, reply) => {
    validate(emptySchema, request.body);
    await rates.check(
      'age-start',
      privateReference(config, 'network', request.ip),
      5,
      600_000,
    );
    if (config.AGE_MODE !== 'provider')
      throw new ServiceError(
        'AGE_UNAVAILABLE',
        'Verified age checks are not configured for this development service.',
        503,
      );
    const result = await provider.start(request.ip);
    reply.setCookie(AGE_COOKIE, result.challenge, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
      maxAge: 600,
    });
    return { url: result.url };
  });
  app.post('/api/age/result', async (request) => {
    await rates.check(
      'age-result',
      privateReference(config, 'network', request.ip),
      30,
      60_000,
    );
    await provider.resolve(validate(ageResultSchema, request.body));
    return { ok: true };
  });
}
