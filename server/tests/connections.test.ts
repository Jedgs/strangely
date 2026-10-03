import { createServer, type Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/config/env.js';
import { createConnections } from '../src/database/connections.js';

// Transport fixture only: this parses Redis's outbound array/bulk framing. It
// intentionally implements no Redis state, scripts, persistence or matchmaking.
function readCommand(
  buffer: Buffer,
): { command: string[]; bytes: number } | undefined {
  const end = buffer.indexOf('\r\n');
  if (end < 0) return;
  if (buffer[0] !== 42) throw new Error('Expected RESP command array');
  const count = Number(buffer.subarray(1, end).toString());
  if (!Number.isInteger(count) || count < 1 || count > 64)
    throw new Error('Invalid RESP command length');
  let offset = end + 2;
  const command: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const bulkEnd = buffer.indexOf('\r\n', offset);
    if (bulkEnd < 0) return;
    if (buffer[offset] !== 36) throw new Error('Expected RESP bulk argument');
    const length = Number(buffer.subarray(offset + 1, bulkEnd).toString());
    if (!Number.isInteger(length) || length < 0 || length > 65536)
      throw new Error('Invalid RESP argument length');
    const start = bulkEnd + 2;
    if (buffer.length < start + length + 2) return;
    if (buffer[start + length] !== 13 || buffer[start + length + 1] !== 10)
      throw new Error('Invalid RESP bulk terminator');
    command.push(buffer.subarray(start, start + length).toString());
    offset = start + length + 2;
  }
  return { command, bytes: offset };
}

function deadline<T>(operation: Promise<T>, maximumMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Transport exceeded the test deadline')),
      maximumMs,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

describe('datastore transport failure bounds', () => {
  it('rejects an in-flight command when a simulated Redis transport stops replying', async () => {
    const sockets = new Set<Socket>();
    const commands: string[][] = [];
    let fixtureError: Error | undefined;
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {});
      let pending: Buffer = Buffer.alloc(0);
      socket.on('data', (data) => {
        pending = Buffer.concat([pending, data]);
        try {
          while (pending.length) {
            const parsed = readCommand(pending);
            if (!parsed) break;
            pending = pending.subarray(parsed.bytes);
            commands.push(parsed.command);
            const name = parsed.command[0]?.toUpperCase();
            if (name === 'PING') continue;
            if (name === 'HELLO') {
              // RESP3 is supported if the client later opts into it.
              socket.write(
                '%7\r\n+server\r\n+redis\r\n+version\r\n+7.0.0\r\n+proto\r\n:3\r\n+id\r\n:1\r\n+mode\r\n+standalone\r\n+role\r\n+master\r\n+modules\r\n*0\r\n',
              );
            } else socket.write('+OK\r\n');
          }
        } catch (error) {
          fixtureError =
            error instanceof Error
              ? error
              : new Error('Transport fixture failed');
          socket.destroy();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Loopback fixture did not start');
    const config = readConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://127.0.0.1/unused_transport_test',
      REDIS_URL: `redis://127.0.0.1:${address.port}`,
      SESSION_SECRET: 'transport-fixture-secret-at-least-thirty-two-characters',
    });
    const connections = createConnections(config);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(deadline(connections.redis.ping(), 500)).rejects.toThrow(
        /closed|offline/i,
      );
      await deadline(connections.redis.connect(), 3000);
      expect(connections.redis.isReady).toBe(true);
      const started = performance.now();
      await expect(deadline(connections.redis.ping(), 23_000)).rejects.toThrow(
        /timeout/i,
      );
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(19_000);
      expect(elapsed).toBeLessThan(23_000);
      expect(connections.redis.isReady).toBe(false);
      await expect(deadline(connections.redis.ping(), 500)).rejects.toThrow(
        /closed|offline/i,
      );
      expect(
        commands.some((command) => command[0]?.toUpperCase() === 'PING'),
      ).toBe(true);
      expect(fixtureError).toBeUndefined();
    } finally {
      if (connections.redis.isOpen) connections.redis.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await connections.db.end();
      errorLog.mockRestore();
    }
  }, 30_000);
});
