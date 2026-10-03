import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../config/env.js';

const config = readConfig();
await runner({
  databaseUrl: config.DATABASE_URL,
  dir: fileURLToPath(new URL('../../migrations/', import.meta.url)),
  direction: 'up',
  migrationsTable: 'schema_migrations',
  count: Infinity,
  log: () => {},
  checkOrder: true,
});
console.info('Database migrations applied');
