import type { FastifyInstance } from 'fastify';
import type { PresenceInfo } from '../../../shared/protocol.js';
import type { ChatServer, ChatSocket } from './server.js';

type PresenceSocket = Pick<ChatSocket, 'connected' | 'data'>;

// Count authenticated chat connections, not unexpired cookies or queue entries.
// This app currently runs one realtime server; a cluster needs shared presence.
export function countActiveUsers(sockets: Iterable<PresenceSocket>): number {
  const users = new Set<string>();
  for (const socket of sockets) {
    if (socket.connected) users.add(socket.data.session.id);
  }
  return users.size;
}

export function registerPresenceRoute(app: FastifyInstance, io: ChatServer) {
  app.get<{ Reply: PresenceInfo }>('/api/presence', async () => ({
    activeUsers: countActiveUsers(io.sockets.sockets.values()),
  }));
}
