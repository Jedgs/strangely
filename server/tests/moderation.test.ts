import { describe, expect, it, vi } from 'vitest';
import { reportSchema } from '../../shared/protocol.js';
import { readConfig } from '../src/config/env.js';
import type { Connections } from '../src/database/connections.js';
import { BanService } from '../src/moderation/bans.js';
import { ReportService } from '../src/moderation/reports.js';
import { clientAddress } from '../src/security/client-address.js';

const config = readConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'unit-test-secret-with-at-least-thirty-two-characters',
});
describe('moderation boundaries', () => {
  it('does not accept a client-selected report subject or excessive descriptions', () => {
    const report = {
      matchId: 'af06b8a1-2522-4d4c-bc09-a972fe8889b7',
      reason: 'harassment',
    };
    expect(reportSchema.safeParse(report).success).toBe(true);
    expect(
      reportSchema.safeParse({ ...report, subject: 'someone-else' }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({ ...report, description: 'a'.repeat(1001) })
        .success,
    ).toBe(false);
  });
  it('uses parameters for report descriptions and stable report deduplication', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const description = "'); DROP TABLE bans; --";
    await new ReportService(
      { query } as unknown as Connections['db'],
      config,
    ).submit(
      {
        matchId: 'af06b8a1-2522-4d4c-bc09-a972fe8889b7',
        reason: 'other',
        description,
      },
      'reporter-ref',
      'witness-subject-ref',
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      'ON CONFLICT (match_id, reporter_ref) DO NOTHING',
    );
    expect(query.mock.calls[0]?.[0]).not.toContain(description);
    expect(query.mock.calls[0]?.[1]).toContain(description);
    expect(query.mock.calls[0]?.[1]).toContain('witness-subject-ref');
  });
  it('fails bans and reports safely when PostgreSQL is down', async () => {
    const db = {
      query: vi.fn().mockRejectedValue(new Error('private db detail')),
    } as unknown as Connections['db'];
    await expect(
      new BanService(db).assertAllowed('subject-ref'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
    await expect(
      new ReportService(db, config).submit(
        { matchId: 'af06b8a1-2522-4d4c-bc09-a972fe8889b7', reason: 'other' },
        'reporter',
        'subject',
      ),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('uses forwarded identity only with explicit proxy trust and valid bounded IP', () => {
    expect(clientAddress('127.0.0.1', '203.0.113.2', false)).toBe('127.0.0.1');
    expect(clientAddress('127.0.0.1', '203.0.113.2, 127.0.0.1', true)).toBe(
      '203.0.113.2',
    );
    expect(clientAddress('127.0.0.1', 'evil.example', true)).toBe('127.0.0.1');
    expect(clientAddress('127.0.0.1', 'a'.repeat(513), true)).toBe('127.0.0.1');
    expect(clientAddress('127.0.0.1', ['203.0.113.2'], true)).toBe('127.0.0.1');
  });
});
