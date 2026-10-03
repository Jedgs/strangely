import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { AdminOverview } from '../../../../shared/admin';
import {
  adminLogin,
  adminLogout,
  adminOverview,
  adminBan,
  adminReview,
  adminRevoke,
} from '../../services/admin';
import { ApiError } from '../../services/api';
import { Brand } from '../../components/Brand';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import '../../developer.css';

type Tab = 'users' | 'reports' | 'events' | 'bans';
type Restriction = { targetRef: string; scope: 'session' | 'network' };
const short = (value: string | null) =>
  value ? value.slice(0, 12) : 'Unavailable';
const when = (value: string) => new Date(value).toLocaleString();

export default function DeveloperPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('users');
  const [restriction, setRestriction] = useState<Restriction | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(24);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [olderPage, setOlderPage] = useState(false);
  const refreshing = useRef(false);
  const mounted = useRef(true);
  const operation = useRef(false);
  const refresh = useCallback(
    async (cursor?: { at: string; id: string }, signal?: AbortSignal) => {
      if (refreshing.current) return;
      refreshing.current = true;
      try {
        const next = await adminOverview(cursor, signal);
        if (!mounted.current) return;
        setData(next);
        setAuthenticated(true);
        setOlderPage(Boolean(cursor));
        setUpdatedAt(new Date().toLocaleTimeString());
        setError(null);
      } catch (failure) {
        if (!mounted.current || signal?.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) {
          setAuthenticated(false);
          setData(null);
        } else
          setError(
            failure instanceof Error
              ? failure.message
              : 'The operator service is unavailable.',
          );
      } finally {
        refreshing.current = false;
        if (mounted.current) setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Strangely — Operator console';
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      document.title = previousTitle;
    };
  }, [refresh]);
  useEffect(() => {
    if (!authenticated || olderPage) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !operation.current)
        void refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [authenticated, olderPage, refresh]);

  async function run(work: () => Promise<unknown>, message: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(message);
      setRestriction(null);
      setRevoking(null);
      setReason('');
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'This action could not be completed.',
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form);
    await run(
      () => adminLogin(String(input.get('password')), String(input.get('otp'))),
      'Administrator session started.',
    );
    form.reset();
  }
  function openRestriction(targetRef: string, scope: Restriction['scope']) {
    setReason('');
    setHours(24);
    setRestriction({ targetRef, scope });
  }
  function exportEvents() {
    if (!data) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      notice:
        'Technical metadata for operator review. Signals do not prove identity or misconduct; this is not a complete forensic record.',
      events: data.events,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `strangely-security-events-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="developer-page">
      <header className="developer-header">
        <Brand />
        <span className="developer-badge">
          <Icon name="shield" /> Operator console
        </span>
        {authenticated ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={() =>
              void run(async () => {
                await adminLogout();
                setAuthenticated(false);
                setData(null);
              }, 'Signed out.')
            }
            disabled={busy}
          >
            Sign out
          </button>
        ) : (
          <a href="/">Back to Strangely</a>
        )}
      </header>
      <main className="developer-main">
        <p className="eyebrow">Private administration</p>
        <h1>Safety overview</h1>
        <p className="developer-intro">
          Review technical signals and reports. A signal is a reason to
          investigate; it does not establish identity or prove wrongdoing.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="developer-notice" role="status">
            {notice}
          </p>
        )}
        {loading ? (
          <p role="status">Checking administrator session…</p>
        ) : !authenticated ? (
          <form
            className="developer-login"
            onSubmit={(event) => void login(event)}
          >
            <h2>Administrator sign in</h2>
            <p>
              Use your operator passphrase and authenticator code. Session
              credentials stay in an HttpOnly cookie.
            </p>
            <label>
              Passphrase
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={16}
                maxLength={128}
              />
            </label>
            <label>
              Authenticator code
              <input
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                aria-describedby="mfa-help"
              />
            </label>
            <p id="mfa-help">
              MFA is required in production. Leave blank only when MFA has not
              been enabled in local development.
            </p>
            <button
              className="button button-primary"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Signing in…' : 'Sign in securely'} <Icon name="arrow" />
            </button>
          </form>
        ) : (
          data && (
            <>
              <div className="developer-stats">
                <article>
                  <span>Active chat sessions</span>
                  <strong>{data.activeCount}</strong>
                </article>
                <article>
                  <span>Open reports shown</span>
                  <strong>{data.reports.length}</strong>
                </article>
                <article>
                  <span>Restrictions shown</span>
                  <strong>{data.bans.length}</strong>
                </article>
                <article>
                  <span>Age assurance mode</span>
                  <strong className="developer-stat-text">
                    {data.ageMode === 'provider'
                      ? 'Provider gate'
                      : 'Development'}
                  </strong>
                </article>
              </div>
              <div className="developer-toolbar">
                <span role="status">
                  Updated {updatedAt}. Refreshes every minute while visible
                  {olderPage ? '; paused on older logs' : ''}.
                </span>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void refresh()}
                  disabled={busy}
                >
                  Refresh latest
                </button>
              </div>
              {(data.audit.failed || data.audit.dropped > 0) && (
                <p className="form-error" role="alert">
                  Audit delivery is incomplete: {data.audit.dropped} events
                  dropped; {data.audit.pending} pending. Check database health
                  and server monitoring.
                </p>
              )}
              <nav className="developer-tabs" aria-label="Console sections">
                {(['users', 'reports', 'events', 'bans'] as const).map(
                  (value) => (
                    <button
                      key={value}
                      type="button"
                      aria-current={tab === value ? 'page' : undefined}
                      onClick={() => setTab(value)}
                    >
                      {value === 'users'
                        ? 'Active sessions'
                        : value === 'reports'
                          ? 'User reports'
                          : value === 'events'
                            ? 'Security events'
                            : 'Restrictions'}
                    </button>
                  ),
                )}
              </nav>
              <section
                className="developer-panel"
                aria-labelledby="console-heading"
              >
                <h2 id="console-heading">
                  {tab === 'users'
                    ? 'Active sessions'
                    : tab === 'reports'
                      ? 'Reports awaiting review'
                      : tab === 'events'
                        ? 'Security event history'
                        : 'Active restrictions'}
                </h2>
                {tab === 'users' && (
                  <>
                    <p>
                      Showing up to 100 authenticated sessions. Country is
                      approximate and available only from a configured trusted
                      edge. IP addresses and exact locations are not exposed.
                    </p>
                    <div className="developer-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Session</th>
                            <th>Connection state</th>
                            <th>Country</th>
                            <th>Age assurance</th>
                            <th>Connected</th>
                            <th>Controls</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.users.map((user) => (
                            <tr key={user.sessionRef}>
                              <td>
                                <code>{short(user.sessionRef)}</code>
                              </td>
                              <td>{user.state}</td>
                              <td>{user.country ?? 'Unavailable'}</td>
                              <td>{user.assurance}</td>
                              <td>{when(user.connectedAt)}</td>
                              <td>
                                <div className="developer-row-actions">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      openRestriction(
                                        user.sessionRef,
                                        'session',
                                      )
                                    }
                                  >
                                    Restrict session
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      openRestriction(
                                        user.networkRef,
                                        'network',
                                      )
                                    }
                                  >
                                    Restrict network
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!data.users.length && (
                        <p className="developer-empty">
                          No chat sessions are currently connected.
                        </p>
                      )}
                    </div>
                  </>
                )}
                {tab === 'reports' && (
                  <>
                    <p>
                      Most recent 100 open reports. Reports are user
                      allegations; review the context before restricting access.
                    </p>
                    <div className="developer-cards">
                      {data.reports.map((report) => (
                        <article key={report.id}>
                          <header>
                            <strong>{report.reason}</strong>
                            <time>{when(report.createdAt)}</time>
                          </header>
                          <p>
                            Subject: <code>{short(report.subjectRef)}</code>
                          </p>
                          <p className="developer-user-text">
                            {report.description || 'No additional description.'}
                          </p>
                          <div className="developer-row-actions">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                openRestriction(report.subjectRef, 'session')
                              }
                            >
                              Restrict subject
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => adminReview(report.id, 'reviewed'),
                                  'Report marked reviewed.',
                                )
                              }
                            >
                              Mark reviewed
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => adminReview(report.id, 'dismissed'),
                                  'Report dismissed.',
                                )
                              }
                            >
                              Dismiss report
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {!data.reports.length && (
                      <p className="developer-empty">No open reports.</p>
                    )}
                  </>
                )}
                {tab === 'events' && (
                  <>
                    <div className="developer-toolbar">
                      <p>
                        50 events per page. Repeated signals are sampled per
                        minute to protect the server.
                      </p>
                      <button
                        type="button"
                        onClick={exportEvents}
                        className="button button-secondary"
                      >
                        Export this page
                      </button>
                    </div>
                    <div className="developer-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Severity</th>
                            <th>Signal</th>
                            <th>Session</th>
                            <th>Network</th>
                            <th>Control</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.events.map((event) => (
                            <tr key={event.id}>
                              <td>{when(event.createdAt)}</td>
                              <td>
                                <span
                                  className={`developer-severity severity-${event.severity}`}
                                >
                                  {event.severity}
                                </span>
                              </td>
                              <td>
                                <code>{event.code}</code>
                              </td>
                              <td>{short(event.sessionRef)}</td>
                              <td>{short(event.networkRef)}</td>
                              <td>
                                {event.code.startsWith('ADMIN_') ? (
                                  'Operator event'
                                ) : event.sessionRef ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      openRestriction(
                                        event.sessionRef!,
                                        'session',
                                      )
                                    }
                                  >
                                    Restrict session
                                  </button>
                                ) : event.networkRef ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      openRestriction(
                                        event.networkRef!,
                                        'network',
                                      )
                                    }
                                  >
                                    Restrict network
                                  </button>
                                ) : (
                                  'No actionable reference'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!data.events.length && (
                        <p className="developer-empty">
                          No security events in this page.
                        </p>
                      )}
                    </div>
                    {data.nextBefore && (
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => void refresh(data.nextBefore!)}
                        disabled={busy}
                      >
                        Older events <Icon name="arrow" />
                      </button>
                    )}
                  </>
                )}
                {tab === 'bans' && (
                  <>
                    <p>
                      Most recent 100 active restrictions. Network restrictions
                      may affect people sharing the same network.
                    </p>
                    <div className="developer-cards">
                      {data.bans.map((ban) => (
                        <article key={ban.id}>
                          <header>
                            <code>{short(ban.targetRef)}</code>
                            <span>Expires {when(ban.expiresAt)}</span>
                          </header>
                          <p className="developer-user-text">{ban.reason}</p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setReason('');
                              setRevoking(ban.id);
                            }}
                          >
                            Revoke restriction
                          </button>
                        </article>
                      ))}
                    </div>
                    {!data.bans.length && (
                      <p className="developer-empty">No active restrictions.</p>
                    )}
                  </>
                )}
              </section>
              <p className="developer-footnote">
                Development review tools. No camera monitoring, precise-location
                tracking, automated guilt scoring, or complete forensic record.
                Configure backups, retention jobs, age verification, and staffed
                moderation before public use.
              </p>
            </>
          )
        )}
        {(restriction || revoking) && (
          <Dialog
            title={revoking ? 'Revoke this restriction?' : 'Restrict access?'}
            eyebrow="Operator decision"
            onClose={() => {
              setRestriction(null);
              setRevoking(null);
            }}
            busy={busy}
          >
            <p>
              {revoking
                ? 'The original action and reversal are retained in the audit trail.'
                : restriction?.scope === 'network'
                  ? 'This can restrict everyone sharing this network, including innocent users. Check the evidence and use a short duration.'
                  : 'This ends the matching session immediately. Anonymous users may create new sessions; this is not permanent identity blocking.'}
            </p>
            <form
              className="developer-action-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    revoking
                      ? adminRevoke(revoking, reason)
                      : adminBan(
                          restriction!.targetRef,
                          restriction!.scope,
                          reason,
                          hours,
                        ),
                  revoking ? 'Restriction revoked.' : 'Access restricted.',
                );
              }}
            >
              <label>
                Reason for this decision
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  minLength={8}
                  maxLength={500}
                />
              </label>
              {!revoking && (
                <label>
                  Duration
                  <select
                    value={hours}
                    onChange={(event) => setHours(Number(event.target.value))}
                  >
                    <option value={1}>1 hour</option>
                    <option value={24}>24 hours</option>
                    <option value={168}>7 days</option>
                  </select>
                </label>
              )}
              <p>
                Do not include ID documents, home addresses, passwords, or
                unnecessary personal data.
              </p>
              <div className="developer-row-actions">
                <button
                  className="button button-danger"
                  type="submit"
                  disabled={busy || reason.trim().length < 8}
                >
                  {busy
                    ? 'Saving…'
                    : revoking
                      ? 'Revoke restriction'
                      : 'Confirm restriction'}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRestriction(null);
                    setRevoking(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </Dialog>
        )}
      </main>
    </div>
  );
}
