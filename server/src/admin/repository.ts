import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import type {
  adminBanSchema,
  AdminBan,
  AdminReport,
  AuditEvent,
} from '../../../shared/admin.js';
import type { Config } from '../config/env.js';
import type { Connections } from '../database/connections.js';
import { ServiceError } from '../security/errors.js';

/** Parameterized queries and small pages keep the operator view off the media path. */
export class AdminRepository {
  constructor(
    private readonly db: Connections['db'],
    private readonly config: Config,
  ) {}
  async overview(before?: string, beforeId?: string) {
    const [events, reports, bans] = await Promise.all([
      this.db.query<AuditEvent>(
        `SELECT id,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",severity,code,network_ref AS "networkRef",session_ref AS "sessionRef" FROM security_events WHERE expires_at > NOW() AND ($1::timestamptz IS NULL OR (created_at,id) < ($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT 51`,
        [before ?? null, beforeId ?? null],
      ),
      this.db.query<AdminReport>(
        `SELECT id,created_at AS "createdAt",subject_ref AS "subjectRef",reason,description,status FROM moderation_reports WHERE expires_at > NOW() AND status='open' ORDER BY created_at DESC,id DESC LIMIT 100`,
      ),
      this.db.query<AdminBan>(
        `SELECT id,target_ref AS "targetRef",reason,expires_at AS "expiresAt" FROM bans WHERE revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 100`,
      ),
    ]);
    const last = events.rows[49];
    return {
      events: events.rows.slice(0, 50),
      reports: reports.rows,
      bans: bans.rows,
      nextBefore:
        events.rows.length > 50 && last
          ? { at: last.createdAt, id: last.id }
          : null,
    };
  }
  async ban(
    input: z.infer<typeof adminBanSchema>,
    knownActive: boolean,
    adminNetwork: string,
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Scope is checked against server-owned references, never a submitted user/IP.
      const known = await client.query<{ known: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM security_events WHERE expires_at > NOW() AND CASE WHEN $2='network' THEN network_ref=$1 ELSE session_ref=$1 END) OR EXISTS(SELECT 1 FROM moderation_reports WHERE expires_at > NOW() AND $2='session' AND subject_ref=$1) AS known`,
        [input.targetRef, input.scope],
      );
      if (!knownActive && !known.rows[0]?.known)
        throw new ServiceError(
          'UNKNOWN_TARGET',
          'This session reference is no longer available.',
          404,
        );
      await client.query(
        `INSERT INTO bans(id,target_ref,reason,expires_at) VALUES($1,$2,$3,NOW()+($4::integer * INTERVAL '1 hour'))`,
        [randomUUID(), input.targetRef, input.reason, input.hours],
      );
      await this.audit(
        client,
        'ADMIN_BAN',
        adminNetwork,
        input.scope === 'session' ? input.targetRef : undefined,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async review(
    id: string,
    status: 'reviewed' | 'dismissed',
    adminNetwork: string,
  ) {
    return this.mutate(
      `UPDATE moderation_reports SET status=$2,reviewed_at=NOW() WHERE id=$1 AND expires_at > NOW() AND status='open' RETURNING subject_ref`,
      [id, status],
      'ADMIN_REPORT_REVIEW',
      adminNetwork,
    );
  }
  async revoke(id: string, reason: string, adminNetwork: string) {
    // Preserve the original reason and append the operator's reversal note.
    return this.mutate(
      `UPDATE bans SET revoked_at=NOW(), reason=LEFT(reason,490)||'; Reversal: '||$2 WHERE id=$1 AND revoked_at IS NULL AND expires_at > NOW() RETURNING target_ref`,
      [id, reason],
      'ADMIN_BAN_REVOKED',
      adminNetwork,
    );
  }
  private async mutate(
    sql: string,
    args: string[],
    code: string,
    adminNetwork: string,
  ) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(sql, args);
      if (!result.rowCount)
        throw new ServiceError(
          'NOT_FOUND',
          'This item is no longer available.',
          404,
        );
      await this.audit(client, code, adminNetwork);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async audit(
    client: PoolClient,
    code: string,
    network: string,
    subject?: string,
  ) {
    await client.query(
      `INSERT INTO security_events(id,severity,code,network_ref,session_ref,expires_at) VALUES($1,'critical',$2,$3,$4,NOW()+($5::integer * INTERVAL '1 day'))`,
      [
        randomUUID(),
        code,
        network,
        subject ?? null,
        this.config.AUDIT_RETENTION_DAYS,
      ],
    );
  }
}
