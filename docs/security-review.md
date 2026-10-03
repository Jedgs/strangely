# Strangely system review — 2026-10-03

This is an implementation review and local verification record, not certification, a legal opinion, a penetration-test guarantee, or a security percentage. **Public launch remains blocked until real age assurance and administrator MFA are configured.** Successful configuration alone does not establish compliance or public-launch readiness.

## Before and after

| Area                | Before this review                                                                    | After this review                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deployment          | Separate client/API workspaces, exact CORS, Vercel and backend Docker settings        | Retained; `/developer` rewrite and HTTP anti-framing CSP added                                                                                                                 |
| User authentication | Random opaque sessions, HttpOnly/Strict cookies, digest-only Redis token keys; no JWT | Retained; End now revokes the session, stale consent is rejected, provider-mode sessions cannot fall back to self-declaration                                                  |
| Operator access     | CLI-only bans; no operator UI                                                         | Private APIs with a separate 30-minute opaque cookie, scrypt password, production-required TOTP MFA, OTP replay prevention, scoped authorization hook and login/action quotas  |
| Security visibility | Reports and bans, no durable security-event dashboard                                 | Bounded metadata audit queue; persistent indexed event history, per-minute refresh, page export and visible delivery-loss counters                                             |
| Abuse controls      | Witness-authorized reports, session-local peer blocks, persistent CLI bans            | Operator session/network restrictions, immediate socket termination, reviewed/dismissed reports and reversible restrictions; durable operator audit and action commit together |
| Location            | No location data                                                                      | Still no GPS/exact location or raw-IP dashboard; optional coarse country needs a separately authenticated trusted edge                                                         |
| Age                 | Checkbox/self-declaration only                                                        | Development notice; production requires signed, expiring, browser-bound, one-use 18+ decisions through a real verification gateway. No provider account is configured          |
| Camera safety       | Local face presence/absence guard                                                     | Exactly one detected face is required; multiple detected faces pause outgoing video immediately. This is not child/age identification and is bypassable in modified clients    |
| Browser embedding   | Existing anti-framing header                                                          | Explicit `X-Frame-Options: DENY` and HTTP CSP `frame-ancestors 'none'` in Vercel/API settings                                                                                  |
| Database            | Parameterized SQL, witness/unique report constraints, ban and retention indexes       | Security-event constraints, expiry/page indexes, keyset pagination, bounded overview queries, transactional operator writes                                                    |
| Code                | React functions and backend service classes                                           | Explicit auth, credential, repository, route, audit and age-provider layers; shared validated contracts; no gratuitous framework rewrite                                       |
| Inline assets       | One progress-bar inline style                                                         | Replaced with CSS selectors. React handlers compile into external JS; source `onClick` handlers are not HTML inline script attributes                                          |

## Routes and data boundaries

| Route                                       | Exposure                                                 | Controls/data                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/health/live`, `/api/health/ready` | Public intentionally                                     | Minimal status only; no datastore credentials/versions/errors                                                                    |
| GET `/api/presence`                         | Public intentionally                                     | Aggregate authenticated connection count only, no user identifiers                                                               |
| GET `/api/age/status`                       | Public, browser-bound challenge when configured          | Requirement/status only; no age, DOB, ID, location, or provider secrets                                                          |
| POST `/api/age/start`                       | Exact frontend origin                                    | Validated empty body, per-network quota, 10-minute HttpOnly challenge cookie                                                     |
| POST `/api/age/result`                      | Server-to-server exception to browser Origin requirement | Strict schema, HMAC, 60-second timestamp window, one transition, endpoint quota; no media or ID uploads                          |
| POST `/api/session`                         | Exact frontend origin                                    | Strict current notices, bans/quotas; configured provider approval required before creation                                       |
| GET `/api/session`                          | Chat cookie required                                     | Live session/ban authorization; temporary TURN credentials after consent                                                         |
| POST `/api/session/end`                     | Exact frontend origin                                    | Validated empty body, token/session revocation, cookie removal                                                                   |
| Socket.IO                                   | Exact frontend origin + chat cookie                      | Ban/session/ownership rechecks, strict payloads, witness authorization, byte/packet/action/network limits and serialized actions |
| POST `/api/admin/login`                     | Exact frontend origin                                    | Scrypt + MFA, per-network/global quotas, no privilege inheritance from chat cookies                                              |
| Other `/api/admin/*`                        | Admin cookie required                                    | Plugin-scoped authentication hook; exact-origin mutations; bounded queries, strict target/reason/duration validation             |
| `/developer` UI assets                      | Public sign-in screen                                    | No private data without API authentication. Knowing the URL conveys no privileges                                                |

REST errors are sanitized, responses are uncached, credentialed CORS trusts one exact configured UI, and all SQL values are parameters. Production sessions stay HttpOnly/Secure/Strict. There is no reason to replace these revocable opaque sessions with JWT solely to appear modern. Admin cookies use the `__Host-` prefix in production.

## Privacy and log limitations

The console records technical signals and reports; it does not observe every action or infer malicious intent. Audit records omit raw IPs, passwords, cookies, tokens, SDP/ICE, request bodies, camera frames, audio, biometric templates and exact locations. Pseudonymous references are still personal data. User report descriptions remain untrusted text, escaped by React, and operators should avoid unnecessary sensitive details in reasons.

Repeated code/reference signals are sampled once per minute. The queue holds at most 500 entries, inserts up to 100 per batch and has a bounded deduplication map. Overload/outage can lose metadata; counters and a sanitized server alert surface that condition. This avoids turning attack traffic into unbounded database work. Exported pages are review records, not tamper-proof evidence or proof of someone's identity. Operator actions require a durable audit insert in the same transaction. Database administrators still control the records.

Default event retention is 14 days; report retention is 30 days. Queries hide expired data, but operators must schedule `npm run db:retention` to physically remove expired records. Backups need their own deletion/access policy. Do not export user metadata to third parties without a valid purpose and appropriate process.

For an optional coarse country, a trusted perimeter must overwrite `cf-ipcountry` and inject the **server-only** `x-strangely-edge-key`, matching `EDGE_GEO_SECRET`. Set `TRUST_EDGE_COUNTRY=true` only behind that perimeter. Restrict direct ingress and strip submitted copies of both headers. Otherwise keep it disabled. A country is approximate metadata, not proof of residence or identity. No browser geolocation permission is requested.

If launching in the Philippines, the National Privacy Commission describes transparency, legitimate purpose, proportionality, and limited retention in the [Data Privacy Act](https://privacy.gov.ph/data-privacy-act/). The operator must obtain review appropriate to the actual launch jurisdiction, finalize notices/contacts and handle reports/appeals and lawful requests. Technical controls cannot promise immunity from legal claims.

## Performance and structure

- Login hashing is asynchronous and rate-limited before scrypt; MFA comparisons are fixed-size and constant-time.
- Scrypt uses N=32768, r=8, p=3, with at most two password hashes in flight; this follows one of the [OWASP password-storage work-factor profiles](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). The encoded hash pins these parameters rather than accepting a cheaper or attacker-selected cost.
- Audit admission/deduplication uses a bounded Map and token budget; memory and per-event eviction work are bounded. Audit persistence is batched off the media path.
- Event pages use the indexed `(created_at,id)` cursor and limit 50; reports/restrictions limit 100. The console refreshes once a minute when visible and pauses polling on older logs.
- Snapshot enumeration is O(n) in connected sockets and returns at most 100 records. Single-instance deployment remains required. Aggregate presence/distributed routing is not implemented for multiple replicas.
- The default ceiling is 500 active sessions, configurable up to 2,000. At most 32 authentication operations may be pending; rejected namespace connections close their transport. Capacity is a protective limit, not a proven load capacity.
- PostgreSQL has a 10-connection pool and 5-second statement timeout. Redis commands are bounded and existing matchmaking uses atomic Lua/ownership fencing; the real-store concurrency suite exercises it.
- Face inference runs in a worker, downsamples transient frames to 320×240 and permits one pending inference. It is not a performance or accuracy guarantee on all devices.
- Operator code/CSS is a separate lazy-loaded chunk. The consumer design and existing React architecture are preserved.

No algorithm can make network/media delays disappear. Real device profiling, load tests, provider quotas and TURN bandwidth measurements remain necessary before claiming a latency target.

## Current verification and remaining work

See the dated verification appendix below for actual commands/results. Remaining external work: real provider account and adapter end-to-end checks, public TLS/custom domains, real two-device media/TURN, proxy perimeter validation, backups/restore, load tests, staffed moderation, finalized privacy/terms and jurisdiction-specific review. Client-side face presence cannot prevent an unverified bystander appearing after access approval or defeat a modified client. Automatic baby/child classification and blanket identity tracking are not implemented or claimed.

### Verification appendix — 3 October 2026

| Check                           | Observed result                                 | Practical scope                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                      | PASS: 69 tests, 14 files                        | Auth isolation, password/MFA/replay limits, age-proof rejection, bounded audit, strict contracts and existing lifecycle regression tests                                                                                  |
| `npm run verify:isolated`       | PASS: 7 real-store checks, no skips             | Fresh disposable PostgreSQL/Redis, migrations, real two-client Socket.IO signaling, concurrency/ownership, operator restrictions and reversal, session revocation, one-use age proof and timestamp-precise log pagination |
| TypeScript, ESLint, Prettier    | PASS                                            | Client, server, shared contracts and project scripts                                                                                                                                                                      |
| Frontend and backend builds     | PASS                                            | Frontend built with an example HTTPS API origin; compiled server and migrations. This is not a deployed endpoint                                                                                                          |
| Backend Docker image            | PASS                                            | Node 24 image built; application module imported; non-root runtime, migration 003 and retention script present; no React source/dependency or `.env` in runtime                                                           |
| Production npm dependency audit | 0 known reported vulnerabilities                | Locked npm dependencies at review time; not an OS/container vulnerability scan or penetration-test certificate                                                                                                            |
| Chrome desktop/mobile           | Observed at 1366×960 and 390×844                | Operator sign-in/MFA, active sessions, report review, immediate restriction/reversal, sign-out, dark button contrast and contained responsive layout; local consent/age notice and policy close/scroll positions checked  |
| Source/browser inline styles    | No matching source usage; none in checked views | Progress uses CSS selectors. Development entry cleanup releases the React root on module replacement                                                                                                                      |
| Local development migration     | Applied additive migrations                     | Audit tables and ban-review index; existing application data was preserved                                                                                                                                                |

Browser screenshots in `verification/strangely-operator-desktop.jpg`, `strangely-operator-mobile.jpg`, `strangely-restriction-mobile.jpg` and `strangely-age-notice-mobile.jpg` show **synthetic, disposable QA sessions**, not monitored users. No hardware camera, actual minor, identity document, external verification account or public hosting was used in these checks. Test containers and the dedicated preview processes were removed after verification; the user's development services were preserved.

The engineering checks above pass locally. **Public-launch readiness remains blocked**, and there is no defensible numeric security score or guarantee of zero abuse, zero delay, accurate child detection or legal immunity. Complete the external work listed above and record production results before launch.
