import { randomUUID } from 'node:crypto';
import type { ReportPayload } from '../../../shared/protocol.js';
import type { Config } from '../config/env.js';
import type { Connections } from '../database/connections.js';
import { unavailable } from '../security/errors.js';

export class ReportService {
  constructor(
    private readonly db: Connections['db'],
    private readonly config: Config,
  ) {}
  async submit(
    data: ReportPayload,
    reporterRef: string,
    subjectRef: string,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO moderation_reports (id, match_id, reporter_ref, subject_ref, reason, description, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7::integer * INTERVAL '1 day'))
        ON CONFLICT (match_id, reporter_ref) DO NOTHING`,
        [
          randomUUID(),
          data.matchId,
          reporterRef,
          subjectRef,
          data.reason,
          data.description || null,
          this.config.REPORT_RETENTION_DAYS,
        ],
      );
    } catch {
      throw unavailable();
    }
  }
}
