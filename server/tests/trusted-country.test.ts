import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config/env.js';
import { trustedCountry } from '../src/security/trusted-country.js';
const config = readConfig({
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'test-only-at-least-thirty-two-character-secret',
  TRUST_EDGE_COUNTRY: 'true',
  EDGE_GEO_SECRET: 'trusted-test-edge-key-at-least-thirty-two-characters',
});
describe('optional trusted country metadata', () => {
  it('ignores forged, missing, disabled and unknown country headers', () => {
    expect(trustedCountry(config, { 'cf-ipcountry': 'PH' })).toBeNull();
    expect(
      trustedCountry(config, {
        'cf-ipcountry': 'PH',
        'x-strangely-edge-key': 'forged',
      }),
    ).toBeNull();
    expect(
      trustedCountry(config, {
        'cf-ipcountry': 'XX',
        'x-strangely-edge-key': config.EDGE_GEO_SECRET,
      }),
    ).toBeNull();
    expect(
      trustedCountry(
        { ...config, TRUST_EDGE_COUNTRY: false },
        {
          'cf-ipcountry': 'PH',
          'x-strangely-edge-key': config.EDGE_GEO_SECRET,
        },
      ),
    ).toBeNull();
  });
  it('shows only a coarse country authenticated by the configured edge', () => {
    expect(
      trustedCountry(config, {
        'cf-ipcountry': 'PH',
        'x-strangely-edge-key': config.EDGE_GEO_SECRET,
      }),
    ).toBe('PH');
  });
});
