# Operations and deployment preparation

For the separate Vercel frontend and Railway backend, follow the [deployment guide](deployment.md). The Compose commands below are operator instructions for an optional local service stack. Configuration files do not perform a cloud deployment, production migration, TLS certificate installation, or TURN provisioning. See the [verification record](verification.md) for checks actually completed.

## Environment boundaries

Use separate development, test and production PostgreSQL databases, Redis instances/keyspaces, and secrets. Keep `.env` files out of Git. Do not put secrets into `VITE_*` variables, image build arguments, Dockerfiles, log messages, screenshots, or client files. Docker build exclusion is in `.dockerignore` (and the legacy `docker/Dockerfile.dockerignore`); it excludes environment files, dependencies, generated builds, verification artifacts, and Git metadata from the context. The image contains only the backend; host the frontend separately.

Production requires a public HTTPS `CLIENT_URL`, an authenticated TURN service, a strong session secret, a strong TURN signing secret, administrator password/MFA and a tested real provider age-verification gateway. Startup is blocked until those prerequisites are configured. Cookies, exact-origin protection, media permissions and WebSocket handling must be verified through the actual TLS proxy. Do not expose the development Vite server as production.

The Compose stack binds only its application port to `127.0.0.1`. PostgreSQL and Redis have **no published host ports**. Place a TLS reverse proxy on the host or explicitly attach a configured proxy to the internal application network. Preserve the public host/origin and support `/socket.io/` upgrades and polling. Decide proxy idle timeouts for long conversations. Keep direct backend access restricted.

`TRUST_PROXY` is `false` in the prepared stack. Enable it only when the entire forwarded-header chain is trusted, the proxy overwrites client-supplied headers, and direct access to the backend is blocked. Confirm network-derived abuse identifiers under that topology; trusting arbitrary headers can bypass limits.

## Optional Docker stack

Docker Desktop/Engine and the Compose plugin must already be installed and approved by the operator. This project does not install them. Review the [official PostgreSQL](https://hub.docker.com/_/postgres), [Redis](https://hub.docker.com/_/redis), and [Node image](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md) guidance before adopting the stack.

The prepared images use Node 24, PostgreSQL 17 and Redis 8 major tags. Pin reviewed image digests for an actual release and record them with its artifact. The backend Node 24 image was built and inspected locally; this does not verify the complete production stack, image vulnerabilities or every CPU architecture. The disposable integration suite uses PostgreSQL 16 and Redis 7. See the dated [system review](security-review.md) for actual results.

1. Copy the operator environment template and set values locally:

   ```powershell
   Copy-Item -LiteralPath docker/.env.example -Destination docker/.env
   ```

2. Generate separate secrets using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Set the PostgreSQL administrator password, a different application password, Redis password, session secret, and coturn shared signing secret. Redis's prepared entrypoint requires at least 64 hexadecimal characters. Do not print or paste completed environment files into chat. For production use a secret manager or restricted runtime injection appropriate to the platform.
3. Set `CLIENT_URL` to the real public HTTPS origin, `TURN_SERVER_URL` and matching `TURN_SHARED_SECRET` to the configured relay, and `COMPOSE_DATABASE_URL`/`COMPOSE_REDIS_URL` to container-network URLs. Configure `ADMIN_PASSWORD_HASH` (single-quoted), `ADMIN_TOTP_SECRET`, provider age mode and the tested gateway URL/signing secret; blanks and placeholder secrets cannot launch production. `postgres` and `redis` are DNS names inside the stack, not host localhost. URI-encode reserved password characters. The Postgres app role is `commonroom`; the database is `commonroom`.
4. Validate the structure without dumping interpolated secrets:

   ```powershell
   docker compose --env-file docker/.env config --quiet
   ```

5. When explicitly choosing to run the prepared stack, build and start dependencies, then migrate once before the application:

   ```powershell
   docker compose --env-file docker/.env build app
   docker compose --env-file docker/.env up -d postgres redis
   docker compose --env-file docker/.env --profile tools run --rm migrate
   docker compose --env-file docker/.env up -d app
   ```

The Docker build restores the lockfile and builds only the backend and shared contracts. The separate frontend build prepares pinned face assets. Image/package retrieval requires network access. The backend runtime runs as the Node non-root user, excludes development dependencies, includes compiled migrations and SQL files, and checks readiness. Automatic migrations are deliberately excluded from normal app startup.

PostgreSQL initializes a bootstrap administrator plus a separate non-superuser application role through `docker/init-db.sh`. Its initialization scripts run only when the data directory is empty. Changing a password environment variable does **not** rotate an existing database role password. Never discard the volume to fix credentials; use an approved credential-change procedure. The app owner role can run migrations; before production, separate the migration identity from a runtime identity with narrower privileges.

Redis uses authentication and memory-only state. Its entrypoint writes a restricted temporary configuration without printing the password, then uses the official entrypoint to drop privileges. Ephemeral Redis data is intentionally not backed up/persisted by this stack. A restart invalidates active sessions/matches; clients must recover. PostgreSQL uses a named persistent volume.

The example Compose environment is a setup template, not a deployable secret store or proof of production readiness. It contains placeholders and no genuine credentials. `docker compose config` without `--quiet` can display secrets; restrict access to Docker, environment files, host processes and container inspection.

### Optional host-local database/Redis access

For isolated development only, `docker/compose.local-ports.yaml` adds loopback mappings for PostgreSQL `5432` and Redis `6379`. Use it only if these ports are free and local services are intended:

```powershell
docker compose --env-file docker/.env -f compose.yaml -f docker/compose.local-ports.yaml up -d postgres redis
```

The environment template must still be filled for Compose interpolation; running only dependencies does not start or deploy the app. Configure the host development `.env` with `localhost` URLs and matching application/Redis passwords, then run `npm run db:migrate` and `npm run check:services`. If PostgreSQL is already installed locally, start only the Redis service. The main Compose file does not expose these ports.

## Health, startup and failure handling

`GET /api/health/live` checks that the process answers HTTP. `GET /api/health/ready` checks PostgreSQL and Redis and returns a safe `503` when either fails. A dependency responding does not prove migrations, TURN, moderation operations, or actual calls work. The Docker app healthcheck uses readiness.

Restrict `/api/health/ready` to trusted infrastructure probes in the public proxy configuration. It performs real dependency work on each request; do not expose it as an unrestricted public polling endpoint. Ordinary participant requests do not need this route. Verify probe access rules through the deployed proxy.

Monitor startup, readiness and shutdown without connection URLs or request bodies. SIGINT/SIGTERM should stop accepting new work, close sockets and Redis/database connections, and terminate peer sessions. During a rolling release one backend instance means active conversations may end; state this operationally rather than promising uninterrupted calls.

Redis failures must prevent new/unauthorized matchmaking or signaling. PostgreSQL failures must make reports explicitly retryable and ban checks fail safely. Do not show a report as submitted when persistence failed. On reconnect, the browser must discard the old peer connection and signals, reauthenticate ownership, and expose a clear path back to search.

## Migrations, retention and recovery

Development migration command: `npm run db:migrate`. Container migration command: the `tools` profile above, which runs `node dist/server/src/database/migrate.js`. The SQL directory is copied into `dist/server/migrations` so the compiled runner finds the same migrations. Apply forward migrations once per release using the intended database; keep the migration ledger intact.

Back up PostgreSQL before schema changes; test restoring into a separate database. Keep the previous application artifact. Prefer a forward repair or compatible previous app version for rollback. The initial migration's down path drops reports/bans and is destructive; do not invoke it or remove data volumes without explicit approval. `docker compose down` removes containers/network; adding `--volumes` deletes PostgreSQL data and is not a routine recovery command.

The retention command deletes expired records. After an operator approves the retention policy, schedule `npm run db:retention`, or use the prepared image in a restricted one-off maintenance job with `node dist/server/src/database/retention.js`. Verify timestamps, row counts and intended environment first. It is not automatically scheduled. Backups, logs and provider retention need their own expiry policy. Expired bans no longer enforce but remain stored until retention maintenance.

## Operator temporary restrictions

Reports never automatically create bans. After an authorized human review, `npm run moderation:ban -- --report-id REPORT_UUID --hours 24 --reason "Reviewed guideline violation"` creates an expiring restriction for the report's server-derived subject. Use exactly one of `--report-id` or `--subject-ref`; the latter must be a known 64-character pseudonymous session reference. Duration must be 1–168 hours and reason must be 1–1000 characters. Review the intended environment first; this command writes to PostgreSQL and should be run only by an authorized operator.

The container equivalent uses the prepared image: `node dist/server/src/moderation/ban-cli.js` with the same arguments and properly injected backend environment. There is no public moderation/admin endpoint. The command reports success/failure without printing secrets or the target. Existing sessions are checked on events and periodic heartbeat; restrictions do not identify someone across new cookies/devices. Expired records are removed by approved retention maintenance. A staffed review process, revocation/appeals procedure, and privileged access audit remain operational work before launch.

## Isolated integration verification

The lifecycle suite requires **both** `INTEGRATION_DATABASE_URL` and `INTEGRATION_REDIS_URL`. It intentionally skips, before its assertions, when either URL is absent, a service is unavailable, or the test schema is unmigrated. A successful command exit containing skipped tests means **NOT YET VERIFIED**, not passed live matchmaking. Review the actual subtest/assertion output.

Use a disposable test database and an isolated idle Redis database/instance. The suite performs concurrent queue operations, lease replacement, report/ban fixture writes, limits, two real Socket.IO software-client signaling, disconnect cleanup, and fixture deletion. It must never share a datastore with a running application. It does not use real browser cameras or validate TURN media.

Copy `.env` to ignored `.env.integration`, generate its own secret, set `NODE_ENV=test`, and point `DATABASE_URL` plus `INTEGRATION_DATABASE_URL` to the same disposable database. Point `REDIS_URL` plus `INTEGRATION_REDIS_URL` to the same isolated Redis database. Run `node --env-file=.env.integration --run db:migrate` before `node --env-file=.env.integration --run test:integration`. Node 24 passes these variables into the project scripts, overriding the normal `.env` file. Confirm the test database using pgAdmin's read-only `SELECT current_database()` before migrating. Keep the test config out of logs and source control.

## TURN operation

Provision TURN separately; no TURN container, certificate, public IP or infrastructure is created by this repository. Configure coturn `use-auth-secret`/`static-auth-secret` to match `TURN_SHARED_SECRET`, HTTPS/TLS policy, listening ports, relay range, public advertised address and allowed traffic/quotas. Review [coturn's configuration reference](https://github.com/coturn/coturn/blob/master/README.turnserver).

Only the backend keeps the shared secret. Authenticated clients receive time-limited username/credential pairs needed by WebRTC. Rate-limit credential issuance and session creation; TURN bandwidth abuse is a financial and reliability risk. Restrict relay use toward internal/private destinations as appropriate to the TURN deployment and test legitimate calls afterward.

Validate UDP and TCP/TLS reachability from actual consumer networks. Test `ICE_TRANSPORT_POLICY=relay`; inspect the selected candidate-pair route in browser WebRTC diagnostics without exporting candidate/IP details to logs. Test credential expiry and long conversations. Default one-hour credentials are not proof that arbitrary-length calls survive refresh/expiry; align session/conversation policy with the tested TURN configuration.

Direct P2P minimizes egress; relay-only reduces peer network-address exposure. The operator must decide the default privacy/cost tradeoff and accurately disclose it. TURN operators still see network and traffic metadata, even though WebRTC encrypts media.

## Minimal monitoring

Track counts and timings rather than personal payloads:

- HTTP readiness and dependency error rates.
- Connected socket count, queue length, wait time, match creation/end reason, and stale-lease cleanup count.
- Negotiation timeout/reconnect/error counts and aggregate selected route type where consent/notice permits.
- Rate-limit hits, report persistence failures, open report backlog, moderation response time, and retention-job outcome.
- Node memory/event-loop pressure, Redis memory/evictions, PostgreSQL pool saturation/storage, and TURN allocations/egress.

Do not log raw IPs, opaque cookies/tokens, request bodies, report descriptions, SQL parameters, SDP, ICE candidates, URLs containing credentials, media, or face frames. Inspect hosting/proxy/TURN logging defaults separately. Configure a real alert destination and on-call owner before launch; none is provisioned here.

## Growth path and costs

First measure concurrent calls and actual relay usage. TURN egress and human moderation can dominate cost. Scale the single server only after adding and verifying Socket.IO's distributed adapter, sticky/proxy behavior where required, atomic socket ownership across instances, cross-node match notification, cleanup and failover. Lua scripts that touch dynamically named keys need review before Redis Cluster; an atomic standalone implementation is not automatically cluster-compatible.

Later options include managed PostgreSQL/Redis with private TLS connections, regional app/TURN placement, bounded regional queues, provider age assurance, moderation tooling with audited access, and aggregate observability. Do not add an SFU, recording service, global routing layer or broad data collection without a demonstrated requirement.

## Release verification checklist

All unresolved items are **NOT YET VERIFIED**. Record actual results, browser/service versions and artifact identity before release.

- [ ] Locked dependency install, typecheck, lint, formatting check, critical tests and build pass.
- [ ] Fresh disposable database migration and live PostgreSQL/Redis integration tests pass.
- [ ] Dockerfile/Compose validation, image build/start, non-root app, dependency authentication and health pass.
- [ ] Production HTTPS, secure cookies, origin rejection and proxy WebSocket behavior pass.
- [ ] Two real browser contexts/devices show bidirectional media; Next/Stop/report/block and reconnect pass.
- [ ] Real-network TURN fallback and relay-only routes, credential expiry and quotas pass.
- [ ] Camera/mic denial, missing devices, slow devices, face detection failures and mobile accessibility are checked.
- [ ] Redis/PostgreSQL outage, restart, stale sockets, match expiry, delayed messages and abuse limits are tested.
- [ ] PostgreSQL backup restore and approved retention maintenance are tested on disposable data.
- [ ] Logs/provider defaults, secret exposure, server errors and client console are reviewed.
- [ ] Image digests, rollback artifact, alert/on-call owner and release window are recorded.
- [ ] [Safety/age/legal/operator decisions](safety-decisions.md) have real approvals and final public notices.

Passing engineering checks does not supply the safety/legal/operator approvals. Preparing this document does not authorize deployment.
