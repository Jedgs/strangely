import { randomBytes } from 'node:crypto';
import type { Config } from '../config/env.js';
import type { Connections } from '../database/connections.js';
import { privateReference } from '../security/identity.js';
import { ServiceError, unavailable } from '../security/errors.js';
import { verifyPassword, verifyTotp } from './credentials.js';

export class AdminAuthService {
  private hashesInFlight = 0;
  constructor(
    private readonly config: Config,
    private readonly redis: Connections['redis'],
  ) {}
  cookieName() {
    return this.config.NODE_ENV === 'production'
      ? '__Host-strangely_admin'
      : 'strangely_admin';
  }
  async login(password: string, otp: string): Promise<string> {
    if (!this.config.ADMIN_PASSWORD_HASH)
      throw new ServiceError(
        'ADMIN_DISABLED',
        'Administrator access is not configured.',
        503,
      );
    if (!this.redis.isReady) throw unavailable();
    if (this.hashesInFlight >= 2)
      throw new ServiceError(
        'RATE_LIMIT',
        'Administrator sign in is busy. Try again shortly.',
        429,
        1000,
      );
    this.hashesInFlight++;
    let passwordAllowed: boolean;
    try {
      passwordAllowed = await verifyPassword(
        password,
        this.config.ADMIN_PASSWORD_HASH,
      );
    } finally {
      this.hashesInFlight--;
    }
    const step = this.config.ADMIN_TOTP_SECRET
      ? verifyTotp(this.config.ADMIN_TOTP_SECRET, otp)
      : null;
    if (!passwordAllowed || (this.config.ADMIN_TOTP_SECRET && step === null))
      throw this.denied();
    if (
      this.config.ADMIN_TOTP_SECRET &&
      !(await this.redis.set(`cr:admin:otp:${step}`, '1', {
        NX: true,
        EX: 120,
      }))
    )
      throw this.denied();
    const token = randomBytes(32).toString('base64url');
    // Absolute 30-minute session; a changed password invalidates all old grants.
    await this.redis.set(this.key(token), this.fingerprint(), { EX: 1800 });
    return token;
  }
  async authenticate(token?: string): Promise<void> {
    if (
      !token ||
      !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !this.config.ADMIN_PASSWORD_HASH
    )
      throw this.denied();
    if (!this.redis.isReady) throw unavailable();
    if ((await this.redis.get(this.key(token))) !== this.fingerprint())
      throw this.denied();
  }
  async logout(token: string) {
    await this.redis.del(this.key(token));
  }
  private key(token: string) {
    return `cr:admin:session:${privateReference(this.config, 'admin-token', token)}`;
  }
  private fingerprint() {
    return privateReference(
      this.config,
      'admin-config',
      `${this.config.ADMIN_PASSWORD_HASH}:${this.config.ADMIN_TOTP_SECRET}`,
    );
  }
  private denied() {
    return new ServiceError(
      'ADMIN_REQUIRED',
      'Administrator authentication is required or has expired.',
      401,
    );
  }
}
