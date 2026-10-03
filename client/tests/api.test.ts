import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession, getSession, getPresence } from '../src/services/api';

afterEach(() => vi.unstubAllGlobals());

describe('session API failures', () => {
  it.each([
    new Response('', { status: 502 }),
    new Response('<html>Service unavailable</html>', { status: 503 }),
    new Response('', { status: 200 }),
  ])(
    'shows a readable service error for non-JSON responses',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(createSession()).rejects.toThrow(
        'The service is unavailable. Please try again.',
      );
    },
  );

  it('preserves actionable errors returned by the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: 'Please accept all required notices to continue.' },
            { status: 400 },
          ),
        ),
    );
    await expect(createSession()).rejects.toThrow(
      'Please accept all required notices to continue.',
    );
  });

  it('explains a connection failure without exposing a browser exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(getSession()).rejects.toThrow(
      'We could not reach Strangely. Please try again in a moment.',
    );
  });

  it('returns the session supplied by a healthy API', async () => {
    const session = {
      sessionId: 'test-session',
      expiresAt: Date.now() + 60000,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(session)));
    await expect(createSession()).resolves.toEqual(session);
  });
});

describe('live user count API', () => {
  it.each([0, 1, 1245])(
    'accepts an accurate count of %i',
    async (activeUsers) => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ activeUsers }));
      vi.stubGlobal('fetch', fetch);
      await expect(getPresence()).resolves.toEqual({ activeUsers });
      expect(fetch).toHaveBeenCalledWith('/api/presence', expect.any(Object));
    },
  );

  it.each([-1, 1.5, '12', undefined])(
    'rejects an invalid count %s',
    async (activeUsers) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ activeUsers })),
      );
      await expect(getPresence()).rejects.toThrow(
        'The live user count is unavailable.',
      );
    },
  );

  it('allows a caller to abort its count request on unmount', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ activeUsers: 0 }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    await getPresence(controller.signal);
    const options = fetch.mock.calls[0]![1] as RequestInit;
    controller.abort();
    expect(options.signal?.aborted).toBe(true);
  });
});
