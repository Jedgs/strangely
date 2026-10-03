import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  countActiveUsers,
  registerPresenceRoute,
} from '../src/realtime/presence.js';
import type { ChatServer, ChatSocket } from '../src/realtime/server.js';

const connection = (id: string, connected = true) => ({
  connected,
  data: { session: { id } } as ChatSocket['data'],
});

describe('public chat presence', () => {
  it('counts unique connected users and ignores disconnected transports', () => {
    expect(
      countActiveUsers([
        connection('one'),
        connection('one'),
        connection('two'),
        connection('offline', false),
      ]),
    ).toBe(2);
    expect(countActiveUsers([])).toBe(0);
  });

  it('returns a fresh aggregate without exposing session identities', async () => {
    const app = Fastify();
    const sockets = new Map([['socket-one', connection('private-session')]]);
    registerPresenceRoute(app, {
      sockets: { sockets },
    } as unknown as ChatServer);
    try {
      const online = await app.inject('/api/presence');
      expect(online.statusCode).toBe(200);
      expect(online.json()).toEqual({ activeUsers: 1 });
      expect(online.body).not.toContain('private-session');
      sockets.clear();
      expect((await app.inject('/api/presence')).json()).toEqual({
        activeUsers: 0,
      });
    } finally {
      await app.close();
    }
  });
});
