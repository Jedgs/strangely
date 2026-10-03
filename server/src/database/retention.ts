import pg from 'pg';
import { readConfig } from '../config/env.js';
const config = readConfig();
const db = new pg.Pool({
  connectionString: config.DATABASE_URL,
  connectionTimeoutMillis: 3000,
  max: 1,
  statement_timeout: 5000,
});
try {
  await db.query('DELETE FROM moderation_reports WHERE expires_at <= NOW()');
  await db.query('DELETE FROM bans WHERE expires_at <= NOW()');
  await db.query('DELETE FROM security_events WHERE expires_at <= NOW()');
  console.info('Expired moderation records removed');
} catch {
  console.error('Retention cleanup failed. Inspect database health and retry.');
  process.exitCode = 1;
} finally {
  await db.end();
}
