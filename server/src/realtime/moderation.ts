import { matchSchema, reportSchema } from '../../../shared/protocol.js';
import { ReportService } from '../moderation/reports.js';
import { validate } from '../security/validation.js';
import { action, type ChatSocket, type RealtimeContext } from './server.js';

export function installModeration(
  socket: ChatSocket,
  context: RealtimeContext,
): void {
  const reports = new ReportService(context.connections.db, context.config);
  socket.on('moderation:report', (payload, reply) =>
    action(
      socket,
      async () => {
        const data = validate(reportSchema, payload);
        const session = await context.authorize(socket);
        await context.rates.check('report', session.sessionRef, 3, 600_000);
        await context.rates.check(
          'report-network',
          socket.data.networkRef,
          10,
          600_000,
        );
        const witness = await context.store.recentPeer(
          session.id,
          socket.id,
          data.matchId,
        );
        // Neither a client-supplied subject nor an unauthenticated match UUID can
        // create a report. The server's short-lived witness determines the subject.
        await reports.submit(data, session.sessionRef, witness.peerRef);
        socket.data.audit.record(
          data.reason === 'underage' ? 'UNDERAGE_REPORT' : 'USER_REPORT',
          data.reason === 'underage' || data.reason === 'abuse'
            ? 'critical'
            : 'warning',
          socket.data.networkRef,
          witness.peerRef,
        );
      },
      reply,
    ),
  );
  socket.on('moderation:block', (payload, reply) =>
    action(
      socket,
      async () => {
        const { matchId } = validate(matchSchema, payload);
        const session = await context.authorize(socket);
        await context.rates.check('block', session.sessionRef, 10, 60_000);
        await context.rates.check(
          'block-network',
          socket.data.networkRef,
          30,
          60_000,
        );
        context.ended(
          socket,
          await context.store.block(session.id, socket.id, matchId),
          'block',
        );
      },
      reply,
    ),
  );
}
