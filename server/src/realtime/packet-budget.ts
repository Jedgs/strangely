import type { Ack } from '../../../shared/protocol.js';
import { TrafficBudget } from '../security/traffic-budget.js';

export function packetBudgetGuard(
  onRejected: () => void,
  budget = new TrafficBudget(120, 8, 1),
): (packet: unknown[], next: (error?: Error) => void) => void {
  return (packet, next) => {
    if (budget.consume('socket').allowed) {
      next();
      return;
    }
    const reply: unknown = packet[packet.length - 1];
    const error: Ack = {
      ok: false,
      code: 'RATE_LIMIT',
      message: 'Too many requests. Please reconnect in a moment.',
      retryAfterMs: 1000,
    };
    if (typeof reply === 'function') {
      try {
        reply(error);
      } catch {
        /* A hostile or closed client cannot bypass cleanup. */
      }
    }
    // Drop this packet before listeners, authorization or queued actions. A
    // sustained flood disconnects rather than accumulating rejected work.
    onRejected();
  };
}
