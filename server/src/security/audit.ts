import { randomUUID } from 'node:crypto';
import type { Connections } from '../database/connections.js';
import type { Config } from '../config/env.js';
import { TrafficBudget } from './traffic-budget.js';

type Severity = 'info' | 'warning' | 'critical';
interface Entry {
  id: string;
  at: string;
  severity: Severity;
  code: string;
  networkRef: string | null;
  sessionRef: string | null;
}

/** Bounded, batched metadata logging. Never accept request bodies, tokens or media. */
export class AuditService {
  private queue: Entry[] = [];
  private flushing = false;
  private failed = false;
  private dropped = 0;
  private readonly dedupe = new TrafficBudget(1, 1 / 60, 4096);
  constructor(
    private readonly db: Connections['db'],
    private readonly config: Config,
  ) {}
  record(
    code: string,
    severity: Severity,
    networkRef?: string,
    sessionRef?: string,
  ): void {
    if (!/^[A-Z_]{1,64}$/.test(code)) return;
    if (
      !this.dedupe.consume(`${code}:${networkRef ?? ''}:${sessionRef ?? ''}`)
        .allowed
    )
      return;
    if (this.queue.length >= 500) {
      this.dropped++;
      return;
    }
    this.queue.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      code,
      severity,
      networkRef: this.reference(networkRef),
      sessionRef: this.reference(sessionRef),
    });
  }
  status() {
    return {
      dropped: this.dropped,
      pending: this.queue.length,
      failed: this.failed,
    };
  }
  async flush(): Promise<void> {
    if (this.flushing || !this.queue.length) return;
    this.flushing = true;
    const batch = this.queue.splice(0, 100);
    try {
      await this.db.query(
        `INSERT INTO security_events(id,created_at,severity,code,network_ref,session_ref,expires_at)
        SELECT id,at,severity,code,network,session,at + ($7::integer * INTERVAL '1 day')
        FROM UNNEST($1::uuid[],$2::timestamptz[],$3::text[],$4::text[],$5::text[],$6::text[]) AS rows(id,at,severity,code,network,session)`,
        [
          batch.map((e) => e.id),
          batch.map((e) => e.at),
          batch.map((e) => e.severity),
          batch.map((e) => e.code),
          batch.map((e) => e.networkRef),
          batch.map((e) => e.sessionRef),
          this.config.AUDIT_RETENTION_DAYS,
        ],
      );
      this.failed = false;
    } catch {
      if (!this.failed)
        console.error(
          'Security audit delivery failed; inspect database health.',
        );
      this.failed = true;
      this.dropped += batch.length;
    } finally {
      this.flushing = false;
    }
  }
  private reference(value?: string) {
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  }
}
