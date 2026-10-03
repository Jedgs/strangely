import pg from 'pg';
import { createClient } from 'redis';
import type { Config } from '../config/env.js';

export function createConnections(config: Config) {
  const db = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
  });
  const redis = createClient({
    url: config.REDIS_URL,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 512,
    socket: {
      connectTimeout: 3000,
      socketTimeout: 20000,
      reconnectStrategy: (retries) => Math.min(500 + retries * 100, 3000),
    },
  });
  // Never log raw driver errors: they may contain hostnames or credentials.
  let lastRedisError = 0;
  redis.on('error', () => {
    if (Date.now() - lastRedisError > 30000) {
      console.error('Redis unavailable');
      lastRedisError = Date.now();
    }
  });
  db.on('error', () => console.error('PostgreSQL pool unavailable'));
  return { db, redis };
}
export type Connections = ReturnType<typeof createConnections>;
