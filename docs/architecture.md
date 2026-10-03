# Commonroom architecture and implementation plan

## Repository inspection

The workspace was empty on 1 October 2026: no app, manifest, repository instructions, tests, or Git history. Node 24 is available. PostgreSQL, Redis, and Docker are not available through the local command path, service inventory, or standard listening ports. Use npm.cmd on Windows because PowerShell blocks npm.ps1. No existing user files need replacement.

## Architecture

One React/TypeScript/Vite client and one Fastify/TypeScript/Socket.IO process. PostgreSQL holds only moderation reports and temporary bans. Redis owns anonymous sessions, leases, unique waiting queue entries, matches, recent-match witnesses, blocks, and rate counters. Native WebRTC carries media directly or through a separately configured TURN server; the application server never records or relays media.

Fastify provides typed routes, body limits, safe errors, and built-in injection testing with less glue than an Express middleware chain. Start with a single server instance. Do not run multiple instances until a Redis Socket.IO adapter and distributed delivery/cleanup are integrated and tested.

## Folder structure

```text
client/src/{components,features,pages,services}
client/public/face/              generated local model/WASM assets
server/src/{config,database,session,matchmaking,security,realtime,moderation,webrtc}
server/migrations/              versioned PostgreSQL SQL
server/tests/                   unit and HTTP tests
server/integration/             live-service tests
shared/                         event payload schemas and contracts
scripts/                        service checks and asset preparation
docs/                           architecture, phase reports, operations
docker/                         deployment preparation
```

## Dependencies and reasons

React/react-dom render the UI; Vite/plugin-react provide fast development and frontend production bundling; socket.io/socket.io-client deliver acknowledged signaling events and connection status; Fastify, @fastify/helmet, and @fastify/cookie provide the separate API, headers, and HttpOnly cookies. Vercel serves the frontend output; the API does not serve frontend assets. Zod validates environment, REST and socket inputs. pg provides parameterized PostgreSQL queries; node-pg-migrate supplies tracked transactional migrations instead of an ORM for two tables. redis is the official Node client. @mediapipe/tasks-vision supplies a locally executed face-presence model, loaded only when camera setup starts. Its pinned model and WASM are served with the frontend, not by a runtime CDN. TypeScript, ESLint, Prettier, tsx, Vitest, and concurrently cover strict checks, formatting, TS execution, critical tests, and development processes. See the [separate deployment guide](deployment.md) for workspace builds and domain configuration.

## Trust and lifecycle

1. Consent POST creates a cryptographic random opaque bearer token in an HttpOnly SameSite cookie and an unrelated UUID session reference. Redis stores only a token digest, self-declared adult/consent version, expiry, and ephemeral ownership. AgeAssuranceProvider is replaceable; the initial provider never claims verified age.
2. Socket handshake checks exact Origin and authenticates the cookie. One socket owns a session at a time. Every event revalidates session, current socket ownership, expiry and ban state. Client UUIDs are never sufficient authorization.
3. Find checks payload, authenticated session, ownership, bans and limits, then a Redis Lua script atomically prunes dead leases, prevents duplicate/self/blocked matches, removes eligible waiting users, and assigns both to one match. Camera/face readiness is a client-side gate and can be bypassed by a modified client. ZSET queue entries are unique and bounded. Leases expire; heartbeat renews them.
4. matched chooses one offerer. Offer → server-authorized peer relay → answer → relay → buffered ICE exchange. Only participants in the current match may signal. Clients never select peer identifiers. Negotiation has a timeout; callbacks from an ended match are discarded.
5. Next atomically ends the old match, clears mappings, notifies the other user, then requeues the caller. The other user explicitly searches again. Stop leaves queue/match and releases local tracks. Disconnect compares the socket ownership fence before cleanup. Stale heartbeats and old disconnect callbacks cannot delete a replacement connection.
6. Block derives the peer from an authorized recent match witness, records a TTL exclusion in both directions, then ends any active match with that target. Blocking a prior participant preserves an unrelated new match. Report derives its subject from the same witness, deduplicates per reporter/match, and persists to PostgreSQL. Report failure is retryable and never shown as submitted. A report does not automatically ban anyone.

## Socket contract

Client → server: queue:join {}, queue:next {matchId}, queue:stop {}, signal:description {matchId,description:{type,sdp}}, signal:ice {matchId,candidate}, moderation:report {matchId,reason,description?}, moderation:block {matchId}.

Every mutation accepts an acknowledgement returning {ok:true,...} or {ok:false,code,message,retryAfterMs?}. Server → client: queue:waiting, match:found {matchId,initiator}, match:ended {matchId,reason}, signal:description, signal:ice, session:ready, session:ended. Payload limits apply at both transport and schema level. No text chat is required for this MVP.

## Data responsibilities and expiry

Redis: sessions (2 hours), live socket leases (60 seconds), matches (maximum session duration), queue memberships (pruned against leases), recent witnesses (15 minutes), personal blocks (session lifetime), counters (window expiry), network-HMAC rate limits. PostgreSQL: reports with configurable retention and bans with mandatory expiry, no accounts or media. Expired moderation data is removed through an explicit retention command. Raw IPs, bearer tokens, SDP and ICE must not be logged.

## Security, privacy and safety decisions

Risk areas are origin/cookie abuse, stale sockets, queue races, forged targets, reconnect spam, compromised clients, report abuse, TURN bandwidth theft, untrusted proxies and accidental sensitive logs. A browser face check can be bypassed and is not identity, age, or conduct verification. P2P may reveal network addresses to the other peer; relay-only mode reduces that exposure at greater bandwidth cost. The TURN signing secret stays on the server; short-lived ICE credentials necessarily reach authorized clients. The app does not record calls, but another participant can record externally.

Before public launch an operator must decide jurisdictions, age-assurance requirements, legal terms/privacy notices, reporting/escalation obligations, moderation staffing/hours, appeal/contact workflows, retention, acceptable content and whether P2P IP exposure is acceptable. Included notices are development drafts. Do not claim these decisions are solved by code, guarantee adult participants, or promise perfect anonymous enforcement. No automatic deployment.

## Implementation checklist

All twelve phases have implementation artifacts. Unchecked entries below represent the complete acceptance criteria, including live services, real media/devices and container checks that remain unavailable here. See [phase reports](phase-reports.md) and [verification](verification.md) for the checks actually performed; these boxes do not mean no work has been implemented.

- [ ] 1. Foundation: manifests/config, client/server startup, SQL migrations, PostgreSQL and Redis checks, strict build/lint/tests.
- [ ] 2. Original design system and landing, desktop/mobile review.
- [ ] 3. Self-declared adult and terms/guidelines/privacy consent, replaceable age provider.
- [ ] 4. Camera/mic preview, permission errors, cancellation and track cleanup.
- [ ] 5. Authenticated sockets, origins, reconnect and disconnect cleanup.
- [ ] 6. Atomic Redis matchmaking, uniqueness, fencing, leases and critical live tests.
- [ ] 7. Authorized WebRTC signaling, buffered ICE, STUN/TURN and negotiation timeouts.
- [ ] 8. Next/Stop/mute/camera/status, throttles and peer-loss states.
- [ ] 9. Local worker face detection, configurable grace/warning/pause/disconnect, no stored frames.
- [ ] 10. Reports/blocks, temporary bans, retention and abuse limits.
- [ ] 11. QA: automated critical cases, two contexts, permissions, disconnections, failures, mobile, console/log review.
- [ ] 12. Docker/environment/HTTPS/monitoring and deployment documentation; no deployment.

Phase reports distinguish implemented checks from NOT YET VERIFIED service and browser checks. Foundation failures remain visible while independent implementation proceeds.

## Primary references checked

- [Fastify support policy](https://fastify.dev/docs/latest/Reference/LTS/)
- [Socket.IO server options and origin controls](https://socket.io/docs/v4/server-options/)
- [Redis Node client](https://redis.io/docs/latest/develop/clients/nodejs/)
- [MediaPipe web face detection](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js): synchronous inference belongs in a worker; browser compatibility requires real device testing.
- [MediaPipe releases](https://github.com/google-ai-edge/mediapipe/releases): upstream maintenance checked before selecting the dependency.
