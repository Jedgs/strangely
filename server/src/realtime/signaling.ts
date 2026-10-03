import { descriptionSchema, iceSchema } from '../../../shared/protocol.js';
import { ServiceError } from '../security/errors.js';
import { validate } from '../security/validation.js';
import { action, type ChatSocket, type RealtimeContext } from './server.js';

export function installSignaling(
  socket: ChatSocket,
  context: RealtimeContext,
): void {
  async function authorizedPeer(
    matchId: string,
  ): Promise<{ socket: ChatSocket; initiator: boolean }> {
    const current = await context.store.peer(
      socket.data.session.id,
      socket.id,
      matchId,
    );
    const peer = context.io.sockets.sockets.get(current.peerOwner);
    if (!peer?.connected)
      throw new ServiceError(
        'MATCH_ENDED',
        'That conversation has ended.',
        409,
      );
    await context.authorize(peer);
    const checked = await context.store.peer(
      socket.data.session.id,
      socket.id,
      matchId,
    );
    if (checked.peerOwner !== peer.id)
      throw new ServiceError(
        'MATCH_ENDED',
        'That conversation has ended.',
        409,
      );
    return { socket: peer, initiator: current.initiator };
  }
  socket.on('signal:description', (payload, reply) =>
    action(
      socket,
      async () => {
        const data = validate(descriptionSchema, payload);
        const session = await context.authorize(socket);
        await context.rates.check(
          'description',
          session.sessionRef,
          16,
          60_000,
        );
        await context.rates.check(
          'signaling-network',
          socket.data.networkRef,
          1200,
          60_000,
        );
        if (!/^v=0\r?\n/.test(data.description.sdp))
          throw new ServiceError(
            'INVALID_REQUEST',
            'The connection information was invalid. Please find another conversation.',
          );
        const peer = await authorizedPeer(data.matchId);
        if ((data.description.type === 'offer') !== peer.initiator)
          throw new ServiceError(
            'INVALID_REQUEST',
            'The connection information arrived out of order. Please try again.',
          );
        peer.socket.emit('signal:description', data);
      },
      reply,
    ),
  );
  socket.on('signal:ice', (payload, reply) =>
    action(
      socket,
      async () => {
        const data = validate(iceSchema, payload);
        const session = await context.authorize(socket);
        await context.rates.check('ice', session.sessionRef, 240, 60_000);
        await context.rates.check(
          'signaling-network',
          socket.data.networkRef,
          1200,
          60_000,
        );
        const peer = await authorizedPeer(data.matchId);
        peer.socket.emit('signal:ice', data);
      },
      reply,
    ),
  );
}
