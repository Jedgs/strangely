import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
const execute = promisify(execFile);
const docker = async (args) =>
  (
    await execute('docker', args, { windowsHide: true, maxBuffer: 1024 * 1024 })
  ).stdout.trim();

/** Fresh loopback-only containers; no access to application volumes or secrets. */
export async function isolatedStores() {
  const id = randomBytes(6).toString('hex');
  const postgres = `strangely-review-postgres-${id}`;
  const redis = `strangely-review-redis-${id}`;
  const password = randomBytes(24).toString('hex');
  const created = [];
  const dispose = async () => {
    for (const name of created.reverse()) {
      if (!/^strangely-review-(postgres|redis)-[a-f0-9]{12}$/.test(name))
        throw new Error('Invalid disposable resource name.');
      await docker(['rm', '--force', '--volumes', name]);
    }
  };
  try {
    await docker([
      'run',
      '--detach',
      '--name',
      postgres,
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_USER=review',
      '--env',
      'POSTGRES_DB=review',
      '--env',
      `POSTGRES_PASSWORD=${password}`,
      'postgres:16-alpine',
    ]);
    created.push(postgres);
    await docker([
      'run',
      '--detach',
      '--name',
      redis,
      '--publish',
      '127.0.0.1::6379',
      'redis:7-alpine',
    ]);
    created.push(redis);
    const port = async (name, value) => {
      const binding = await docker(['port', name, value]);
      const number = binding.split(':').at(-1);
      if (!/^\d+$/.test(number)) throw new Error('Unexpected loopback port.');
      return number;
    };
    const databaseUrl = `postgresql://review:${password}@127.0.0.1:${await port(postgres, '5432/tcp')}/review`;
    const redisUrl = `redis://127.0.0.1:${await port(redis, '6379/tcp')}`;
    const probe = new pg.Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 500,
    });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await probe.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    await probe.end();
    if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
    return { databaseUrl, redisUrl, dispose };
  } catch {
    await dispose();
    throw new Error(
      'Disposable test stores could not start. The live stores were not modified.',
    );
  }
}
