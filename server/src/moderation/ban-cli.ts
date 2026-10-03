import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { readConfig } from '../config/env.js';
import { createConnections } from '../database/connections.js';

// Explicit operator command; reports never create bans automatically. Default
// targets are session pseudonyms, avoiding a network-wide penalty for shared IPs.
async function main() {
  const { values } = parseArgs({
    options: {
      'report-id': { type: 'string' },
      'subject-ref': { type: 'string' },
      hours: { type: 'string' },
      reason: { type: 'string' },
    },
    strict: true,
  });
  const options = z
    .object({
      'report-id': z.uuid().optional(),
      'subject-ref': z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      hours: z.coerce.number().int().min(1).max(168),
      reason: z.string().trim().min(1).max(1000),
    })
    .refine(
      (value) => Boolean(value['report-id']) !== Boolean(value['subject-ref']),
      'Choose one report ID or subject reference',
    )
    .parse(values);
  const { db } = createConnections(readConfig());
  try {
    let subject = options['subject-ref'];
    if (options['report-id']) {
      const report = await db.query<{ subject_ref: string }>(
        'SELECT subject_ref FROM moderation_reports WHERE id = $1 AND expires_at > NOW()',
        [options['report-id']],
      );
      subject = report.rows[0]?.subject_ref;
      if (!subject) throw new Error('Report was not found or has expired.');
    }
    await db.query(
      "INSERT INTO bans (id, target_ref, reason, expires_at) VALUES ($1, $2, $3, NOW() + ($4::integer * INTERVAL '1 hour'))",
      [randomUUID(), subject, options.reason, options.hours],
    );
    console.info(
      'Temporary restriction created. Review and retention remain operator responsibilities.',
    );
  } finally {
    await db.end();
  }
}
void main().catch(() => {
  console.error(
    'Temporary restriction failed. Check the arguments, configuration and database availability.',
  );
  process.exitCode = 1;
});
