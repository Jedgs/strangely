import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiOrigin } from '../src/services/backend-config';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('frontend backend origin', () => {
  it('uses the development proxy when unset and normalizes a deployment origin', () => {
    expect(resolveApiOrigin(undefined)).toBe('');
    expect(resolveApiOrigin('')).toBe('');
    expect(resolveApiOrigin(' https://api.strangely.example/ ')).toBe(
      'https://api.strangely.example',
    );
  });
  it.each([
    'javascript:alert(1)',
    'https://token@api.example.com',
    'https://api.example.com/api',
    'https://api.example.com?secret=unsafe',
    'https://api.example.com#hash',
    'not-a-url',
  ])('rejects unsafe or ambiguous origins: %s', (value) => {
    expect(() => resolveApiOrigin(value)).toThrow();
  });
  it('sends REST requests and credentials to the configured API origin', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.strangely.example');
    vi.resetModules();
    const fetch = vi.fn().mockResolvedValue(Response.json({ activeUsers: 3 }));
    vi.stubGlobal('fetch', fetch);
    const { getPresence } = await import('../src/services/api');
    await expect(getPresence()).resolves.toEqual({ activeUsers: 3 });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.strangely.example/api/presence',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
