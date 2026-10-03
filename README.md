# Strangely

Operator/security updates: [360 review](docs/security-review.md), [private console and age integration](docs/operator-console.md), and [separate Vercel/Railway deployments](docs/deployment.md). Public launch is blocked until a real age-assurance gateway and administrator MFA are configured.

Strangely is an original, anonymous video-chat MVP for adults who confirm they are 18 or older. It uses React, TypeScript, Vite, Fastify, Socket.IO, native WebRTC, PostgreSQL, and Redis. Visitors do not create accounts. Calls are not recorded by this application.

The frontend and backend are independent npm workspaces in this repository. Use the [Vercel + Railway deployment guide](docs/deployment.md) for exact settings, environment variables, domain requirements, and post-deployment checks.

The age gate is **self-declaration, not verified age**. Browser face presence does not establish identity, age, or safe behavior. The supplied policy text is a development draft. This repository is a development implementation; public launch requires the decisions and verification in [safety decisions](docs/safety-decisions.md) and [operations](docs/operations.md).

Implementation and verification results are recorded in [phase reports](docs/phase-reports.md) and the [verification record](docs/verification.md). A build or unit-test pass does not establish that cameras, two-peer WebRTC, TURN, PostgreSQL, Redis, or deployment work. Items without a recorded successful runtime check remain **NOT YET VERIFIED**.

## Architecture

```text
React browser (Vercel) -- HTTPS / Socket.IO --> Fastify server (Railway)
                                                    |       |
                                                PostgreSQL Redis

Browser A <--------- encrypted WebRTC -----------> Browser B
                direct, or through configured TURN
```

The application server handles sessions, matchmaking, signaling, reports, blocks, and limits. It does not normally carry media. TURN is a separate media relay required when a direct route fails. Direct WebRTC can reveal network addresses to the other participant; `ICE_TRANSPORT_POLICY=relay` uses TURN for all media at greater bandwidth cost.

Start with **one backend process**. Redis makes matchmaking mutations atomic; it does not by itself deliver Socket.IO messages between backend instances. Scaling requires a tested Socket.IO Redis adapter, distributed socket ownership and cleanup, proxy configuration, and appropriate load testing. See the full [architecture and checklist](docs/architecture.md).

### Technology choices

| Dependency                                  | Purpose                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| React, react-dom, TypeScript, Vite          | Typed UI, development server, production assets.                                           |
| Fastify                                     | HTTP routes, request limits, safe errors, and injection-based HTTP testing.                |
| @fastify/cookie, @fastify/helmet            | HttpOnly session cookies and HTTP security headers.                                        |
| Socket.IO and socket.io-client              | Acknowledged matchmaking/signaling events and connection lifecycle.                        |
| Zod                                         | Server environment, REST, and socket payload validation.                                   |
| pg                                          | Parameterized PostgreSQL queries and connection pooling.                                   |
| node-pg-migrate                             | Versioned SQL migrations with a migration ledger; two tables do not justify an ORM.        |
| redis                                       | Official Node client; Lua scripts enforce realtime invariants.                             |
| @mediapipe/tasks-vision                     | Local browser face-presence inference, loaded during camera setup.                         |
| ESLint, Prettier, Vitest, tsx, concurrently | Lint, formatting, automated critical checks, TypeScript execution, parallel dev processes. |

Each workspace has its own dependencies in `client/package.json`, `server/package.json`, and `shared/package.json`. The root `package-lock.json` locks all workspaces. There is no UI kit, animation framework, normal account system, or recording service.

### Folder structure

```text
client/src/                 React views, camera, face presence and WebRTC
client/public/face/         generated local model and WASM assets
client/dist/                frontend-only production build
client/vercel.json          Vercel frontend settings and security headers
server/src/                 Fastify, sessions, Redis, signaling and moderation
server/migrations/          tracked SQL migrations
server/dist/                backend-only JavaScript, contracts and migrations
server/Dockerfile           backend-only production runtime image
server/tests/               isolated critical logic and HTTP tests
server/integration/         live-service tests
shared/                     payload schemas and socket contracts
scripts/                    dependency checks and face-asset preparation
docs/                       architecture, phase reports, safety and operations
docker/                     optional deployment preparation
compose.yaml                optional private service stack
railway.json                backend build, migrations and health check
```

## Requirements and installation

- Node.js **24 or newer**, with npm.
- PostgreSQL installed locally; use a supported release and the pgAdmin 4 client if preferred. The optional container configuration uses PostgreSQL 17.
- Redis accessible from the backend. On Windows use an existing Docker Desktop or WSL installation if available; neither is installed automatically.
- A current browser with camera/microphone and WebRTC support. Real-device verification is still required for each supported browser.
- An authenticated TURN service for production and restrictive-network testing.

From the repository directory, restore exactly the locked dependencies if setting up a new checkout:

```powershell
npm.cmd ci
Copy-Item -LiteralPath .env.example -Destination .env
```

On systems where npm runs directly, use `npm` instead of `npm.cmd`. Windows PowerShell may block the `npm.ps1` wrapper; `npm.cmd` avoids changing execution policy. Packages were approved and installed for this workspace. No PostgreSQL, Redis, Docker, WSL, browser, or production infrastructure is installed by these instructions.

Generate a random local session secret and paste it into the ignored `.env` file:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not put the generated value in source control, screenshots, issues, or chat. Use a different secret per environment. Fill in your local `DATABASE_URL` and `REDIS_URL` before starting the backend. `.env.example` contains placeholders, not working credentials.

## PostgreSQL and pgAdmin setup

1. Install PostgreSQL Server and pgAdmin from the [official Windows download page](https://www.postgresql.org/download/windows/). Keep port `5432` unless another installation already uses it. Set the installer administrator password locally and keep it in your password manager.
2. Open pgAdmin 4. If the local server is not listed, right-click **Servers → Register → Server**. Name it `Local PostgreSQL`. Under **Connection**, use host `localhost`, port `5432`, maintenance database `postgres`, administrator username chosen at installation, and its password. The [pgAdmin connection documentation](https://www.pgadmin.org/docs/pgadmin4/latest/connecting.html) describes the dialogs.
3. Expand the server. Right-click **Login/Group Roles → Create → Login/Group Role**. Set the name to `commonroom`. In **Definition**, set a strong application password. In **Privileges**, enable login, leave superuser, create roles, replication, and bypass RLS disabled. Save. The [PostgreSQL role documentation](https://www.postgresql.org/docs/current/sql-createrole.html) explains these privilege boundaries.
4. Right-click **Databases → Create → Database**. Name it `commonroom`, select owner `commonroom`, and save. Creating the role/database is the only manual schema setup; migrations create application tables.
5. Set `.env` to `DATABASE_URL=postgresql://commonroom:YOUR_ENCODED_PASSWORD@localhost:5432/commonroom`. Replace the placeholder locally. Percent-encode reserved URL characters in the password; do not reuse the PostgreSQL administrator account as the application login.
6. From the repository directory run:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run check:services
   ```

7. In pgAdmin refresh **Databases → commonroom → Schemas → public → Tables**. Expect `moderation_reports`, `bans`, and migration ledger `schema_migrations`.
8. Right-click **commonroom → Query Tool**, then run read-only checks:

   ```sql
   SELECT current_database(), current_user;
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
   SELECT status, count(*) FROM moderation_reports GROUP BY status;
   ```

For production, use a dedicated migration role and a runtime role with only required table privileges. The local owner role is a development convenience. Set appropriate TLS/connection requirements for remote PostgreSQL rather than disabling certificate verification.

### Data and migrations

PostgreSQL stores `moderation_reports` and expiring `bans`. Reports contain a match UUID, pseudonymous session references, reason, optional description, status, timestamps, and retention expiry. A uniqueness constraint prevents one reporter creating duplicate reports for the same match. Bans have explicit expiry and optional revocation. There are no account, media, screenshot, frame, or biometric tables.

`npm run db:migrate` applies unapplied SQL from `server/migrations` through node-pg-migrate and records each migration in `schema_migrations`. Keep existing applied migration files unchanged; create a new forward migration for later changes. Run migrations once before starting a new release. The included down migration drops tables and data; do not run it against valued data without explicit approval and a tested backup.

`npm run db:retention` deletes expired report and ban records. It is an explicit, data-deleting maintenance command, not a scheduler. Select the policy first, test on a disposable database, and schedule only in the intended environment. `REPORT_RETENTION_DAYS` affects new reports; changing it does not rewrite existing expiry timestamps or erase backups.

## Redis setup on Windows

Redis stores temporary sessions, socket leases, the unique waiting queue, active matches, recent-match witnesses, blocks, and TTL-limited abuse counters. Permanent moderation history belongs in PostgreSQL.

Choose one supported local approach. The project does not install either tool:

- **Existing Docker Desktop:** use the optional Compose Redis service described in [operations](docs/operations.md), or start the [official Redis image](https://hub.docker.com/_/redis) with an authenticated configuration and a loopback-only port mapping. Keep port `6379` private.
- **Existing WSL:** follow [Redis's Windows/WSL instructions](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-windows/) inside the distribution, then configure Redis authentication and a connection reachable from Windows. Distribution and firewall behavior vary; test the backend connection rather than assuming `localhost` works.
- **Existing managed Redis:** set `REDIS_URL` to the provider's private/TLS URL, including its credentials, according to its documentation.

Set `REDIS_URL=redis://localhost:6379` only for an isolated local Redis instance without authentication. Authenticated Redis uses `redis://:YOUR_ENCODED_PASSWORD@localhost:6379`; remote TLS uses `rediss://...`. Do not disable managed-service TLS or expose Redis publicly to get a connection working.

Run `npm.cmd run check:services`. It prints a separate PASS/FAIL for PostgreSQL and Redis without printing credentials and exits nonzero if either service is unavailable. Healthy checks do not prove the schema was migrated.

## Frontend, backend and development

Prepare the local face-detection assets before the first build:

```powershell
npm.cmd run assets:face
```

This copies the pinned package's WASM files and prepares the pinned model in `client/public/face/`. Asset preparation requires network access if the model has not been cached; camera use does not fetch a runtime CDN. Generated assets are ignored by Git. Keep the model/package version, license, and checksum policy under review before upgrades.

Start both development processes:

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Use that exact hostname, matching `CLIENT_URL`. Vite proxies `/api` and `/socket.io` to `http://127.0.0.1:3001`, so browser requests and cookies remain on one origin. To start processes separately, use `npm run dev:client` and `npm run dev:server` in separate terminals.

The browser flow is confirm 18+ and policies → allow camera/microphone → local preview/face check → find stranger → live conversation → Next, Stop, Report, or Block. Camera permission requires a secure context; browsers permit localhost for local development. A phone opening the development server by an ordinary LAN HTTP address is not equivalent to localhost and may deny media APIs. Use a trusted HTTPS development origin for real-phone testing.

## Environment variables

Only backend configuration is read from `.env`. No database, Redis, session, or TURN signing secret belongs in a Vite `VITE_*` variable or client bundle.

| Variable                                                 | Meaning                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`, `HOST`, `PORT`                               | Runtime mode, bind address and backend port. Local defaults are development, `127.0.0.1`, `3001`; containers bind `0.0.0.0`. |
| `CLIENT_URL`                                             | Exact allowed browser origin; `http://127.0.0.1:5173` in development, public HTTPS origin in production.                     |
| `DATABASE_URL`, `REDIS_URL`                              | Server-only service URLs; encode credential characters and use TLS for remote services.                                      |
| `SESSION_SECRET`                                         | At least 32 characters; generate 32 random bytes, not a phrase. Used for pseudonymous references.                            |
| `STUN_SERVER_URL`                                        | Configured STUN URL for direct-route discovery. Third-party STUN may receive network metadata.                               |
| `TURN_SERVER_URL`                                        | TURN/TURNS URL. Production requires configured TURN.                                                                         |
| `TURN_SHARED_SECRET`                                     | At least 32 characters, matching coturn `use-auth-secret`; server-only signing secret.                                       |
| `TURN_CREDENTIAL_TTL_SECONDS`                            | Short-lived browser ICE credential expiry; default 3600, allowed 300–86400 seconds.                                          |
| `ICE_TRANSPORT_POLICY`                                   | `all` permits direct routes with TURN fallback; `relay` requires TURN and relays all media.                                  |
| `SESSION_TTL_SECONDS`                                    | Anonymous session lifetime; default 7200, allowed 300–86400 seconds.                                                         |
| `REPORT_RETENTION_DAYS`                                  | New moderation-report expiry; default 30, allowed 1–365 days. Operator must choose the actual policy.                        |
| `FACE_INTERVAL_MS`                                       | Detection interval; default 1500 ms, allowed 1000–10000 ms.                                                                  |
| `FACE_WARNING_MS`, `FACE_PAUSE_MS`, `FACE_DISCONNECT_MS` | Increasing absence thresholds; defaults 10000, 30000, 60000 ms.                                                              |
| `TRUST_PROXY`                                            | Leave `false` unless a trusted proxy overwrites forwarded headers and direct access is restricted.                           |

Environment validation rejects placeholder session secrets, invalid threshold ordering, relay without TURN, and production without HTTPS/TURN. Successful validation does not prove those services are reachable.

## Sessions, sockets and matchmaking

The landing page reads `GET /api/presence` immediately and every 15 seconds while visible. The public response contains only `{ activeUsers }`: unique authenticated chat users connected to this backend, including camera preview, matching, and conversations. Landing-only visitors and unconnected or expired session cookies are not counted. Requests use the existing origin checks, rate budget, and `Cache-Control: no-store`; the badge shows an unavailable state if fetching fails. This aggregate follows the application's current single-backend architecture and must be distributed alongside realtime ownership before adding backend replicas.

A successful consent request creates a random session reference and a strong opaque session credential in an HttpOnly SameSite cookie. Redis stores a credential digest, consent version, and expiry. The UUID is a reference, not authorization. The age provider is replaceable; the initial implementation reports self-declared adulthood only.

The socket handshake checks the origin and cookie. Each event validates payload, session, current socket ownership, expiry, relevant ban, membership, and limits. Socket connection middleware alone is insufficient because it runs only once per connection; see [Socket.IO middleware](https://socket.io/docs/v4/middlewares/). Origin restrictions cover WebSocket requests as well as polling; [Socket.IO explains why CORS alone is insufficient](https://socket.io/docs/v4/handling-cors/).

| Client event         | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `queue:join`         | Enter matching or wait.                                  |
| `queue:next`         | End the current match and search again.                  |
| `queue:stop`         | Leave queue/match.                                       |
| `signal:description` | Relay validated offer/answer to the current peer.        |
| `signal:ice`         | Relay bounded ICE candidate to the current peer.         |
| `moderation:report`  | Submit a report for a match the session participated in. |
| `moderation:block`   | Exclude the participant in an authorized recent match.   |

Mutations acknowledge success or a safe error. Server events include `session:ready`, `session:ended`, `queue:waiting`, `match:found`, `match:ended`, and peer signaling. The client never chooses a target session/socket identifier. See `shared/protocol.ts` for payload schemas.

Redis Lua performs atomic queue and match transitions. A sorted set prevents duplicate queue entries. Live socket leases prevent dead candidates; mutual block exclusions prevent matching blocked sessions. One active match is assigned to both participants atomically. Socket ownership fences prevent a delayed disconnect from removing a replacement connection. TTLs and cleanup remove stale state. Report/block permissions use short-lived recent-match witnesses.

Next ends the old peer connection, notifies the peer, and requeues the caller. The peer can search again. Stop closes the connection, leaves the queue, and releases camera/microphone tracks. Refresh, network loss, socket disconnection, and session expiry end ownership and clean match state. Redis restart loses ephemeral state; users must reconnect and search again.

## WebRTC and STUN/TURN

The server assigns one offerer. That browser adds local tracks, creates an offer, and sends it through authorized signaling. The peer applies the offer and returns an answer. Both exchange ICE candidates; clients buffer candidates until a remote description exists. Late messages from ended matches must be discarded. Connection/negotiation timeouts provide a retry path instead of an endless spinner.

STUN helps discover routes. TURN supplies the relay route needed on restrictive networks. Configure an authenticated coturn or equivalent service outside the application, with TLS where appropriate, UDP/TCP reachability, advertised public address, relay port range, quotas, and monitoring. See [WebRTC TURN configuration](https://webrtc.org/getting-started/turn-server) and [coturn configuration](https://github.com/coturn/coturn/blob/master/README.turnserver).

The TURN **shared signing secret never reaches the browser**. The authenticated backend issues temporary username/credential pairs; WebRTC necessarily needs those short-lived credentials in the browser. Static TURN passwords are not returned to clients. Configure credential lifetime for the intended conversation duration and test expiry/recovery. A configured URL alone is not TURN verification; test a relay-only call across networks and confirm the selected candidate pair is a relay.

TURN egress is the main usage-dependent infrastructure cost. Relay-only privacy increases that cost. Other growth costs include concurrent backend connections, Redis memory, regional TURN capacity, monitoring, and human moderation. A media SFU or recording infrastructure is not needed for this MVP.

## Face presence

Face detection runs locally at a configurable interval instead of every frame. It checks presence only: no identity lookup, age estimate, face comparison, or database profile. Temporary misses have a grace period, then a warning, pause, and eventual disconnect. Poor lighting, movement, camera quality, CPU load, and false negatives require real-device testing and clear recovery actions.

The app does not persist frames, face images, landmarks, or biometric templates. Inference can be bypassed by a modified client; it is a UX/safety aid, not a server-enforced guarantee. Worker/asset initialization errors must be surfaced rather than silently counted as valid detection.

## Moderation, security and privacy

Report categories cover inappropriate behavior, harassment, spam, suspected underage use, abuse, and other concerns. Descriptions are bounded. Reports derive their subjects from verified match participation and are deduplicated. A report is an allegation; one unverified report does not automatically ban a participant. PostgreSQL failure must show a retryable report error, not confirmation.

Block ends the interaction and excludes the same anonymous sessions from matching again while block/session state exists. It does not identify someone across devices, networks, or cleared cookies. Temporary bans are operator-controlled data, not a public unauthenticated moderation interface. Human review and escalation procedures are launch requirements.

After an authorized human review, the operator can create an expiring restriction using a stored report ID:

```powershell
npm.cmd run moderation:ban -- --report-id REPLACE_WITH_REPORT_UUID --hours 24 --reason "Reviewed guideline violation"
```

Replace the report placeholder locally. The command accepts **one** of `--report-id` or `--subject-ref` (a 64-character session HMAC), requires a reason, and limits duration to 1–168 hours. It derives the report subject from PostgreSQL and does not automatically act on allegations. It prints no target/reference or secret. A session ban is limited by anonymous identity; clearing cookies or creating another session can bypass it. Restriction creation and report/ban retention remain operator responsibilities. No ban has been created merely by preparing this feature.

The implementation is designed around exact origins, HttpOnly cookies, validated events, bounded requests/messages, parameterized SQL, TTLs, rate limits, Next/reconnect throttles, safe errors, security headers, and no secret logging. These protections require testing in the target proxy/TLS environment; they do not establish perfect security.

| Information                      | Storage/purpose                                                                                      | Retention                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous credential and consent | HttpOnly browser cookie; Redis digest/session. No name or account.                                   | Configured session expiry.                                                                                                                          |
| Queue, match, lease, block       | Redis; matching, authorization, cleanup, exclusions.                                                 | Ephemeral TTL/cleanup; recent match witnesses are short-lived.                                                                                      |
| Network reference                | Keyed pseudonymous reference in the Redis session and abuse counters; process-local traffic buckets. | Session reference until session expiry (default 2 hours); counters/buckets have separate finite windows. Raw IP is not written to application logs. |
| Reports and bans                 | PostgreSQL; operator review/enforcement.                                                             | Explicit expiry and retention maintenance; backups need separate policy.                                                                            |
| Video, audio and face frames     | In-memory browser processing and encrypted WebRTC transport.                                         | No application recording or persistence.                                                                                                            |

Session/network digests remain pseudonymous information, not guaranteed anonymous data. Infrastructure, STUN/TURN providers, and other participants may observe network metadata. A stranger can record outside the app. Consent and privacy notices must accurately describe the deployed infrastructure.

## Checks and two-browser testing

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run build
npm.cmd run check:services
npm.cmd run test:integration
```

`npm run format` intentionally rewrites formatting. Unit tests cover isolated critical logic. Integration tests require **both** `INTEGRATION_DATABASE_URL` and `INTEGRATION_REDIS_URL`, a migrated disposable test database, and an isolated idle Redis database. The suite creates sessions, manipulates its own queue/lease records, creates test reports/bans, and removes its fixtures. Do not point it at a running app or valued data. A separate Redis logical database is acceptable only when it is isolated from every running app using that database; a dedicated instance is preferable.

For a separate test configuration, copy `.env` to ignored `.env.integration`. Set its `DATABASE_URL` and `INTEGRATION_DATABASE_URL` to the **same disposable test database**, and its `REDIS_URL` and `INTEGRATION_REDIS_URL` to the **same isolated Redis database**. Keep its own generated session secret and development/test mode. Then run through Node 24 so those environment values override the normal development file:

```powershell
node --env-file=.env.integration --run db:migrate
node --env-file=.env.integration --run test:integration
```

If either integration URL is absent, either service is unavailable, or the isolated schema is unmigrated, the suite deliberately reports **SKIP / NOT YET VERIFIED** before its lifecycle assertions. An exit code of zero with skipped tests is not a passing Redis/PostgreSQL/Socket.IO validation. The suite checks software clients and store invariants; it does not establish real-browser media or TURN interoperability.

Use separate normal/incognito windows or different browsers to avoid sharing the same anonymous cookie. Close other camera-using applications. Two windows may compete for a single physical camera; two devices or supported virtual/test media may be needed. Fake streams test software behavior and do not prove real camera/audio interoperability.

Until observed and recorded, every item below is **NOT YET VERIFIED**:

- [ ] Both sessions consent and preview their own camera/audio successfully.
- [ ] One waits; the second matches once; neither receives duplicate matches.
- [ ] Remote video and audio flow both ways; mute/camera controls work.
- [ ] Next ends both peers and requeues only the caller; old signals are ignored.
- [ ] Stop, tab close, refresh, network loss, expiry, and reconnect clean state/tracks.
- [ ] Repeated join/Next/report/reconnect attempts hit appropriate limits.
- [ ] Block prevents rematching those sessions; report persists exactly once.
- [ ] Camera/mic denied or missing, face misses, worker errors, and WebRTC timeout recover.
- [ ] PostgreSQL failure does not report false success; Redis failure does not create unsafe matches.
- [ ] Relay-only TURN works across networks and selected ICE route is confirmed.
- [ ] Desktop and real-phone layouts, keyboard focus/dialogs, reduced motion, console and server logs are checked.
- [ ] At least two supported browser engines are tested with real media.

## Troubleshooting

| Symptom                              | Check                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend refuses startup              | Replace secret placeholders; check URL format, HTTPS/TURN production requirements, and increasing face thresholds.                                        |
| Database connection fails            | PostgreSQL service, port, application role password, database owner, URL encoding, and remote TLS/firewall policy.                                        |
| `relation does not exist`            | Run migrations against the exact database in the backend URL.                                                                                             |
| Redis connection fails               | Redis is running/reachable, URL/password/TLS correct, WSL networking/firewall understood.                                                                 |
| Socket rejected or session missing   | Exact `CLIENT_URL` origin, consent completion, cookie behavior, proxy upgrades; use the Vite URL rather than backend port in development.                 |
| Camera/mic unavailable               | Secure context, OS/browser permission, connected devices, other camera applications; allow explicitly and retry.                                          |
| Camera works but peer never connects | Signaling logs without SDP/ICE, network restrictions, TURN authentication/ports/public address, ICE route and negotiation timeout.                        |
| Face detector cannot load            | Run `assets:face`, check model/WASM requests and worker errors, then verify browser support.                                                              |
| Phone cannot use camera on LAN HTTP  | Use a trusted HTTPS origin configured in `CLIENT_URL`; localhost exemptions apply to the device's own localhost.                                          |
| Reports fail                         | Database/readiness, migrations, recent-match eligibility, deduplication and rate limits; preserve/retry the report rather than assuming it was submitted. |

## Deployment preparation

`npm run build` produces `client/dist` and `server/dist`; set the frontend's public HTTPS `VITE_API_URL` before building. `npm start` starts only the compiled API. Vercel publishes the frontend output, and Railway runs the backend image with PostgreSQL/Redis and separately configured TURN. See the [deployment guide](docs/deployment.md). No cloud deployment has been performed.

Follow [operations](docs/operations.md) for secrets, image preparation, migrations, health endpoints, retention, backup/restore, monitoring, graceful shutdown, scaling, and the release checklist. Review [safety decisions](docs/safety-decisions.md) before exposing the service publicly.
