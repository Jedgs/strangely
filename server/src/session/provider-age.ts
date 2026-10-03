import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { consentSchema } from '../../../shared/protocol.js';
import type {
  AgeAssuranceProvider,
  AgeAssuranceResult,
} from './age-assurance.js';
import type { Config } from '../config/env.js';
import type { Connections } from '../database/connections.js';
import { privateReference } from '../security/identity.js';
import { ServiceError, unavailable } from '../security/errors.js';

export const AGE_COOKIE = 'strangely_age';
export const ageResultSchema = z
  .object({
    challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    adultVerified: z.boolean(),
    timestamp: z.number().int().nonnegative(),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const RESOLVE = `local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local entry=cjson.decode(raw); if entry.status ~= 'pending' then return 0 end; entry.status=ARGV[1]; redis.call('SET',KEYS[1],cjson.encode(entry),'KEEPTTL'); return 1`;
const CONSUME = `local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local entry=cjson.decode(raw); if entry.status~='verified' or entry.network~=ARGV[1] then return 0 end; redis.call('DEL',KEYS[1]); return 1`;

/** An operator-controlled gateway must verify the real vendor result server-side.
 * This boundary accepts only signed, short-lived, browser-bound 18+ decisions.
 * It is not a facial age classifier or a completed vendor integration.
 */
export class ProviderAgeService implements AgeAssuranceProvider {
  constructor(
    private readonly config: Config,
    private readonly redis: Connections['redis'],
  ) {}
  async start(ip: string) {
    this.ready();
    const challenge = randomBytes(32).toString('base64url');
    await this.redis.set(
      this.key(challenge),
      JSON.stringify({
        status: 'pending',
        network: privateReference(this.config, 'network', ip),
      }),
      { EX: 600 },
    );
    const url = new URL(this.config.AGE_VERIFICATION_URL);
    url.searchParams.set('reference', challenge);
    url.searchParams.set(
      'returnUrl',
      `${new URL(this.config.CLIENT_URL).origin}/?ageReturn=1`,
    );
    return { challenge, url: url.toString() };
  }
  async status(
    challenge: string | undefined,
    ip: string,
  ): Promise<'pending' | 'verified' | 'rejected' | 'not-started'> {
    this.ready();
    if (!challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge))
      return 'not-started';
    const raw = await this.redis.get(this.key(challenge));
    if (!raw) return 'not-started';
    const value = JSON.parse(raw) as {
      status: 'pending' | 'verified' | 'rejected';
      network: string;
    };
    return value.network === privateReference(this.config, 'network', ip)
      ? value.status
      : 'not-started';
  }
  async resolve(input: z.infer<typeof ageResultSchema>): Promise<void> {
    this.ready();
    const expected = createHmac('sha256', this.config.AGE_WEBHOOK_SECRET)
      .update(
        `${input.timestamp}\n${input.challenge}\n${input.adultVerified ? 'adult' : 'denied'}`,
      )
      .digest();
    if (
      Math.abs(Date.now() - input.timestamp * 1000) > 60000 ||
      !timingSafeEqual(expected, Buffer.from(input.signature, 'hex'))
    )
      throw new ServiceError(
        'AGE_SIGNATURE_INVALID',
        'This verification result is not allowed.',
        403,
      );
    const applied = await this.redis.eval(RESOLVE, {
      keys: [this.key(input.challenge)],
      arguments: [input.adultVerified ? 'verified' : 'rejected'],
    });
    if (applied !== 1)
      throw new ServiceError(
        'AGE_RESULT_EXPIRED',
        'This verification result has expired or was already processed.',
        409,
      );
  }
  async assess(
    _consent: z.infer<typeof consentSchema>,
    proof?: { challenge?: string; ip: string },
  ): Promise<AgeAssuranceResult> {
    this.ready();
    if (!proof?.challenge || !/^[A-Za-z0-9_-]{43}$/.test(proof.challenge))
      return { adultAllowed: false, assurance: 'provider-verified' };
    const allowed = await this.redis.eval(CONSUME, {
      keys: [this.key(proof.challenge)],
      arguments: [privateReference(this.config, 'network', proof.ip)],
    });
    return { adultAllowed: allowed === 1, assurance: 'provider-verified' };
  }
  private key(value: string) {
    return `cr:age:${privateReference(this.config, 'age-challenge', value)}`;
  }
  private ready() {
    if (this.config.AGE_MODE !== 'provider' || !this.redis.isReady)
      throw unavailable();
  }
}
