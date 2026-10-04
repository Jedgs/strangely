import { randomBytes, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  consentSchema,
  CONSENT_VERSION,
  type SessionInfo,
} from '../../../shared/protocol.js';
import type { Config } from '../config/env.js';
import type { Connections } from '../database/connections.js';
import type { AgeAssuranceProvider } from './age-assurance.js';
import { privateReference } from '../security/identity.js';
import { ServiceError, unavailable } from '../security/errors.js';
import { makeIceServers } from '../webrtc/ice.js';

export const SESSION_COOKIE = 'cr_session';
export interface AnonymousSession {
  id: string;
  expiresAt: number;
  ipRef: string;
  sessionRef: string;
  consentVersion: string;
  assurance: 'self-declared' | 'provider-verified';
}
const CREATE_SESSION = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1
`;

export class SessionService {
  constructor(
    private readonly config: Config,
    private readonly redis: Connections['redis'],
    private readonly age: AgeAssuranceProvider,
  ) {}
  async create(
    consent: z.infer<typeof consentSchema>,
    ip: string,
    challenge?: string,
  ): Promise<{ token: string; session: AnonymousSession }> {
    if (!this.redis.isReady) throw unavailable();
    const assurance = await this.age.assess(consent, {
      ...(challenge ? { challenge } : {}),
      ip,
    });
    if (!assurance.adultAllowed)
      throw new ServiceError('SAFETY_REQUIRED', 'This session is not available.', 403);
    const token = randomBytes(32).toString('base64url');
    const session: AnonymousSession = {
      id: randomUUID(),
      expiresAt: Date.now() + this.config.SESSION_TTL_SECONDS * 1000,
      ipRef: privateReference(this.config, 'network', ip),
      sessionRef: '',
      consentVersion: consent.version,
      assurance: assurance.assurance,
    };
    session.sessionRef = privateReference(this.config, 'session', session.id);
    try {
      const created = await this.redis.eval(CREATE_SESSION, {
        keys: [`cr:session:${session.id}`, this.tokenKey(token)],
        arguments: [
          JSON.stringify(session),
          session.id,
          String(this.config.SESSION_TTL_SECONDS),
        ],
      });
      if (created !== 1) throw unavailable();
    } catch {
      throw unavailable();
    }
    return { token, session };
  }
  async authenticate(token: string | undefined): Promise<AnonymousSession> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ServiceError(
        'SESSION_REQUIRED',
        'Please confirm consent to continue.',
        401,
      );
    if (!this.redis.isReady) throw unavailable();
    try {
      const id = await this.redis.get(this.tokenKey(token));
      const raw = id ? await this.redis.get(`cr:session:${id}`) : null;
      if (!raw)
        throw new ServiceError(
          'SESSION_EXPIRED',
          'Your session has expired. Please start again.',
          401,
        );
      const session = JSON.parse(raw) as AnonymousSession;
      if (
        session.expiresAt <= Date.now() ||
        session.consentVersion !== CONSENT_VERSION
      )
        throw new ServiceError(
          'SESSION_EXPIRED',
          'Your session has expired. Please start again.',
          401,
        );
      return session;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw unavailable();
    }
  }
  info(session: AnonymousSession): SessionInfo {
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      iceServers: makeIceServers(this.config, session.id),
      iceTransportPolicy: this.config.ICE_TRANSPORT_POLICY,
      face: {
        intervalMs: this.config.FACE_INTERVAL_MS,
        warningMs: this.config.FACE_WARNING_MS,
        pauseMs: this.config.FACE_PAUSE_MS,
        disconnectMs: this.config.FACE_DISCONNECT_MS,
      },
    };
  }
  async revoke(token: string): Promise<void> {
    const session = await this.authenticate(token);
    await this.redis.del([`cr:session:${session.id}`, this.tokenKey(token)]);
  }
  private tokenKey(token: string): string {
    return `cr:token:${privateReference(this.config, 'token', token)}`;
  }
}
