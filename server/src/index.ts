import { readConfig } from './config/env.js';
import { createConnections } from './database/connections.js';
import { createApp } from './app.js';

async function start() {
  const config = readConfig();
  const connections = createConnections(config);
  // Serve honest health/error responses while Redis attempts to recover.
  void connections.redis
    .connect()
    .catch(() => console.error('Redis connection failed'));
  const app = await createApp(config, connections);
  const close = async () => {
    await app.close();
    if (connections.redis.isOpen) connections.redis.destroy();
    await connections.db.end();
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
  await app.listen({ port: config.PORT, host: config.HOST });
  console.info(`Strangely API listening on port ${config.PORT}`);
}
void start().catch((error) => {
  console.error(
    error instanceof Error && error.message.startsWith('Invalid configuration:')
      ? error.message
      : 'Server startup failed',
  );
  process.exitCode = 1;
});
