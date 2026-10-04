import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/config/env.js';
import {
  ageResultSchema,
  ProviderAgeService,
} from '../src/session/provider-age.js';
import type { Connections } from '../src/database/connections.js';
import { CONSENT_VERSION } from '../../shared/protocol.js';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'test-only-session-secret-at-least-thirty-two-characters',
};
const config = readConfig({
  ...base,
  AGE_MODE: 'provider',
  AGE_VERIFICATION_URL: 'https://age-gateway.example/start',
  AGE_WEBHOOK_SECRET: 'test-only-webhook-secret-at-least-thirty-two-characters',
});
const consent = {
  terms: true,
  guidelines: true,
  privacy: true,
  version: CONSENT_VERSION,
} as const;

describe('verified age gate', () => {
  it('blocks public configuration without provider assurance and operator MFA', () => {
    expect(() =>
      readConfig({
        ...base,
        NODE_ENV: 'production',
        CLIENT_URL: 'https://app.example.com',
        TURN_SERVER_URL: 'turn:example.com:3478',
        TURN_SHARED_SECRET: 'a'.repeat(64),
      }),
    ).toThrow('Public launch is blocked');
    expect(() =>
      readConfig({
        ...base,
        AGE_MODE: 'provider',
        AGE_VERIFICATION_URL: 'http://age.example',
        AGE_WEBHOOK_SECRET: 'a'.repeat(64),
      }),
    ).toThrow();
  });
  it('rejects forged fields, signatures and old callbacks before touching state', async () => {
    const evalMock = vi.fn();
    const service = new ProviderAgeService(config, {
      isReady: true,
      eval: evalMock,
    } as unknown as Connections['redis']);
    const input = {
      challenge: 'a'.repeat(43),
      adultVerified: true,
      timestamp: Math.floor(Date.now() / 1000),
      signature: '0'.repeat(64),
    };
    expect(
      ageResultSchema.safeParse({ ...input, dateOfBirth: '2000-01-01' })
        .success,
    ).toBe(false);
    await expect(service.resolve(input)).rejects.toMatchObject({
      code: 'AGE_SIGNATURE_INVALID',
    });
    const timestamp = input.timestamp - 120;
    const signature = createHmac('sha256', config.AGE_WEBHOOK_SECRET)
      .update(`${timestamp}\n${input.challenge}\nadult`)
      .digest('hex');
    await expect(
      service.resolve({ ...input, timestamp, signature }),
    ).rejects.toMatchObject({ code: 'AGE_SIGNATURE_INVALID' });
    expect(evalMock).not.toHaveBeenCalled();
  });
  it('does not treat a checkbox as verified and uses an atomic browser-bound grant', async () => {
    const evalMock = vi.fn().mockResolvedValue(0);
    const service = new ProviderAgeService(config, {
      isReady: true,
      eval: evalMock,
    } as unknown as Connections['redis']);
    expect((await service.assess(consent)).adultAllowed).toBe(false);
    expect(evalMock).not.toHaveBeenCalled();
    expect(
      (
        await service.assess(consent, {
          challenge: 'a'.repeat(43),
          ip: '203.0.113.1',
        })
      ).adultAllowed,
    ).toBe(false);
    expect(JSON.stringify(evalMock.mock.calls)).not.toContain('203.0.113.1');
  });
});
