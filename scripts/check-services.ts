import { readConfig } from '../server/src/config/env.js';
import { createConnections } from '../server/src/database/connections.js';
const connections = createConnections(readConfig());
const results = await Promise.allSettled([
  connections.db.query('SELECT 1'),
  Promise.race([
    (async () => {
      await connections.redis.connect();
      return connections.redis.ping();
    })(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis timeout')), 4000),
    ),
  ]),
]);
for (const [index, result] of results.entries()) {
  console.info(
    `${index === 0 ? 'PostgreSQL' : 'Redis'}: ${result.status === 'fulfilled' ? 'PASS' : 'FAIL (not connected)'}`,
  );
}
if (connections.redis.isOpen) connections.redis.destroy();
await connections.db.end();
if (results.some((result) => result.status === 'rejected'))
  process.exitCode = 1;
