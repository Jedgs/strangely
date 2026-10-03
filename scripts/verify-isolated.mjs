import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { isolatedStores } from './lib/isolated-stores.mjs';

if (process.env.NODE_ENV === 'production')
  throw new Error('Local development verification only.');
const stores = await isolatedStores();
try {
  await runner({
    databaseUrl: stores.databaseUrl,
    dir: fileURLToPath(new URL('../server/migrations/', import.meta.url)),
    direction: 'up',
    migrationsTable: 'schema_migrations',
    log: () => {},
  });
  const environment = {
    ...process.env,
    INTEGRATION_DATABASE_URL: stores.databaseUrl,
    INTEGRATION_REDIS_URL: stores.redisUrl,
  };
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        '--test',
        '--test-concurrency=1',
        'server/integration/lifecycle.test.ts',
        'server/integration/security-review.test.ts',
      ],
      { shell: false, env: environment, stdio: 'inherit', windowsHide: true },
    );
    child.once('error', () =>
      reject(new Error('The isolated test runner could not start.')),
    );
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Isolated security verification failed.')),
    );
  });
  console.info(
    'PASS: isolated PostgreSQL/Redis lifecycle and security review.',
  );
} finally {
  await stores.dispose();
}
