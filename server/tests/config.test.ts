import { describe, it, expect } from 'vitest';
import { readConfig } from '../src/config/env.js';
const base = {
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'a'.repeat(64),
};
describe('environment safety', () => {
  it('rejects malformed datastores and non-origin client URLs', () => {
    expect(() =>
      readConfig({ ...base, DATABASE_URL: 'postgres-invalid' }),
    ).toThrow('Invalid configuration');
    expect(() => readConfig({ ...base, REDIS_URL: 'redis://[' })).toThrow(
      'Invalid configuration',
    );
    expect(() =>
      readConfig({ ...base, CLIENT_URL: 'https://example.com/chat' }),
    ).toThrow('Invalid configuration');
    expect(() =>
      readConfig({ ...base, CLIENT_URL: 'javascript:alert(1)' }),
    ).toThrow('Invalid configuration');
    expect(() => readConfig({ ...base, CLIENT_URL: 'https://[' })).toThrow(
      'Invalid configuration',
    );
  });
  it('requires secrets without exposing their input', () => {
    expect(() => readConfig({ ...base, SESSION_SECRET: 'private' })).toThrow(
      'Invalid configuration',
    );
    expect(() =>
      readConfig({ ...base, SESSION_SECRET: 'private' }),
    ).not.toThrow('private');
    const placeholder = 'REPLACE_WITH_64_RANDOM_HEX_CHARACTERS';
    expect(() =>
      readConfig({ ...base, SESSION_SECRET: placeholder }),
    ).toThrow();
    expect(() =>
      readConfig({
        ...base,
        AGE_MODE: 'provider',
        AGE_VERIFICATION_URL: 'https://gateway.example/start',
        AGE_WEBHOOK_SECRET: placeholder,
      }),
    ).toThrow('Provider age checks');
    expect(() =>
      readConfig({
        ...base,
        TURN_SERVER_URL: 'turns:relay.example:5349',
        TURN_SHARED_SECRET: placeholder,
      }),
    ).toThrow('TURN requires');
    expect(() =>
      readConfig({
        ...base,
        TRUST_EDGE_COUNTRY: 'true',
        EDGE_GEO_SECRET: placeholder,
      }),
    ).toThrow('Country metadata requires');
  });
  it('requires HTTPS and TURN in production', () => {
    expect(() => readConfig({ ...base, NODE_ENV: 'production' })).toThrow(
      'Production requires',
    );
  });
  it('rejects unsafe face timing and relay without TURN', () => {
    expect(() => readConfig({ ...base, FACE_PAUSE_MS: '5000' })).toThrow();
    expect(() =>
      readConfig({ ...base, ICE_TRANSPORT_POLICY: 'relay' }),
    ).toThrow();
  });
  it('requires secure cookies when SameSite=None is selected', () => {
    expect(() =>
      readConfig({ ...base, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' }),
    ).toThrow('SameSite=None cookies require COOKIE_SECURE=true');
    expect(() =>
      readConfig({ ...base, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' }),
    ).not.toThrow();
  });
});
