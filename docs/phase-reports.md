# Phase reports

These reports record implementation separately from verification. No public deployment has occurred. Live PostgreSQL/Redis services were unavailable during the initial build; missing checks are NOT YET VERIFIED, not passed.

## Phase 1 — foundation

- **Phase completed:** Foundation implementation; live-service verification pending.
- **Implemented:** React/Vite/strict TypeScript, Fastify API, shared validated protocol, lint/format/test tooling, environment validation, PostgreSQL/Redis clients, health/readiness endpoints, tracked migration and retention commands.
- **Files created:** root package/config/environment/ignore files; client/index.html, client/vite.config.ts, client/tsconfig.json, client/src/{main,App,styles}; server/tsconfig.json, server/src/{index,app}, server/src/config/env.ts, server/src/database/{connections,migrate,retention}.ts, server/migrations/001_moderation.sql; shared/protocol.ts; scripts/check-services.ts; server/tests/config.test.ts; docs/architecture.md and this report.
- **Files modified:** New scaffold only; workspace was empty.
- **Dependencies added:** React/React DOM, Fastify with cookie/helmet/static plugins, Socket.IO server/client, pg, redis, node-pg-migrate, Zod, MediaPipe; TypeScript/Vite/plugin-react, ESLint/typescript-eslint/hooks/globals, Prettier, tsx, Vitest, concurrently and type declarations. Exact versions recorded in package.json/package-lock.json. npm audit at installation reported zero vulnerabilities.
- **Database changes:** Versioned reports/bans migration authored; NOT YET VERIFIED against PostgreSQL.
- **Tests performed:** npm run build; npm run lint; npm test; npm run check:services; actual client page opened in Chrome; HTTP live and ready health checked.
- **Passed:** Strict compilation, production client/server build, lint, 3/3 configuration tests, frontend startup and rendered scaffold, API startup/live HTTP 200, readiness failure HTTP 503.
- **Failed:** PostgreSQL connection and Redis connection (services absent); live migration not executed. An initial npm install was blocked by offline cache; approved network download succeeded. Initial test invocation preceded dev-tool installation; rerun after installation passed. Sandboxed tsx/esbuild subprocess spawning returned EPERM; approved checks ran with subprocess access.
- **Bugs found/fixed:** Narrowed unknown Fastify errors safely for strict typing; added finite timeout to service check.
- **Security/privacy:** Local random secret is in ignored .env; no secret values printed. Configuration errors do not serialize input. API origins checked; headers and body limits applied. No media storage.
- **Known limitations:** DB/Redis connectivity and migrations NOT YET VERIFIED. Full app behavior not present at this phase. No Docker/service installation authorized.
- **Next phase:** Original design system and landing, then consent and media setup.

## Phase 2 — original design system and landing

- **Phase completed:** Implementation and desktop/phone CSS layout checks.
- **Implemented:** Parchment/forest/terracotta tokens, Georgia editorial headings with system sans body, spacing/radius/button/icon/form/dialog patterns, original SVG conversation illustration, navigation, how-it-works, safety, native FAQ and draft policy dialogs; subtle reduced-motion-aware transitions.
- **Files created:** client/src/components/{Brand,Icon,Dialog,LegalDialog}.tsx, client/src/pages/LandingPage.tsx.
- **Files modified:** client/src/App.tsx, client/src/styles.css.
- **Dependencies added / database changes:** None.
- **Tests performed/passed:** Client TypeScript/owned ESLint/Prettier; actual Chrome desktop visual review. Phone layout inside a real 390×844 same-origin iframe had no horizontal overflow. Native Escape restored focus to CTA. Desktop short-height spacing refined after screenshot review.
- **Failed / bugs found / bugs fixed:** Browser viewport override did not resize the connected Chrome viewport; used developer iframe fixtures to exercise real CSS breakpoints. In-progress unstyled UI and HMR hook-order logs were observed during development; final review uses fresh tabs after edits.
- **Security/privacy:** No invented testimonials, users, peers, activity counts or demo call. SVG is original. Policies clearly identify self-declared age, peer IP exposure and external recording.
- **Known limitations:** Physical mobile devices, Safari/Firefox and reduced-motion device settings NOT YET VERIFIED.
- **Next phase:** Four-item consent UI and backend acceptance.

## Phase 3 — server consent and age gate

- **Phase completed:** Server implementation; UI review and live persistence pending.
- **Implemented:** Four mandatory server-side consent checks/version, self-declared AgeAssuranceProvider interface, opaque cookie token, finite Redis session, reusable consent identity, origin restriction, parameterized bans, rate limits and per-session ICE configuration.
- **Files created:** server/src/session/{age-assurance,service,routes}.ts, server/src/security/{errors,identity,rate-limit}.ts, server/src/moderation/bans.ts, server/src/webrtc/ice.ts, server/tests/session.test.ts.
- **Files modified:** server/src/app.ts; no unrelated files.
- **Dependencies added / database changes:** None beyond phase 1.
- **Tests performed/passed:** Seven HTTP/security/session tests and server strict compilation passed. Consent rejects invalid/missing acceptance; configuration/ICE checks do not expose signing secret.
- **Failed / bugs found / bugs fixed:** Production asset root mismatch found by independent review and corrected to dist/client.
- **Security/privacy:** Only the cookie is a bearer credential; public session UUID cannot authorize actions. Self-declaration does not verify age. TURN signing secret never leaves server; short-lived ICE credentials do.
- **Known limitations:** Redis session persistence, production cookies and real age-provider integration NOT YET VERIFIED.
- **Next phase:** Explicit camera/microphone setup and preview.

### Phase 3 — UI verification addendum

Created client/src/components/ConsentDialog.tsx and integrated real session creation in App. Actual Chrome verified disabled continuation before four checks, pending feedback, real HTTP 503 failure with selections retained and retry enabled, and Escape focus return. No media permission requested during this flow. A 390px consent component fixture measured 352.4px dialog width with no horizontal clipping; its tall content scrolls within 90dvh. Draft policy links remain available. No new dependencies/database changes. Live consent/session persistence remains NOT YET VERIFIED.

## Phase 4 — media access and cleanup

- **Phase completed:** Client implementation; real hardware checks pending.
- **Implemented:** Explicit camera/microphone request after consent, preview stream, understandable permission/device errors, cancellation generation guard, late permission stream release, mute/camera controls, device-end handling and page/unmount cleanup.
- **Files created:** client/src/services/api.ts, client/src/features/camera/media.ts, client/src/features/video-chat/useConversation.ts; focused feature modules described in phases 7–9.
- **Files modified:** client/src/main.tsx with ErrorBoundary.
- **Dependencies added / database changes:** None.
- **Tests performed/passed:** Client strict compilation; peer lifecycle tests verify independently cloned outbound video does not stop private detection tracks.
- **Failed / bugs found / bugs fixed:** Early typing issues from optional ICE properties fixed with explicit normalization; lint requires preserving caught-error cause, added without showing causes in UI.
- **Security/privacy:** Media permissions remain native browser choices. Tracks are released on Stop; no recording/upload API is implemented.
- **Known limitations:** Actual camera/microphone permissions, denial variations, device unplug and hardware cleanup NOT YET VERIFIED on real devices.
- **Next phase:** Authenticated real-time connection.

## Phase 5 — Socket.IO

- **Phase completed:** Server/client implementation; live connection verification pending.
- **Implemented:** Cookie handshake, exact transport Origin, one socket owner per anonymous session, per-event session/ban/ownership validation, finite reconnect, explicit ended state, per-socket serialized bounded work, disconnect fencing and lease renewal.
- **Files created:** server/src/realtime/server.ts; socket client in client/src/features/video-chat/useConversation.ts.
- **Files modified:** server/src/app.ts and server/src/index.ts.
- **Dependencies added / database changes:** None.
- **Tests performed/passed:** Server strict compilation and seven HTTP/security tests.
- **Failed / bugs found / bugs fixed:** No fabricated socket success; live Redis unavailable.
- **Security/privacy:** Raw bearer token, IP, SDP and ICE are not logged; peer socket IDs are never chosen by clients.
- **Known limitations:** Multi-browser socket/reconnect behavior NOT YET VERIFIED; single-server deployment only.
- **Next phase:** Atomic Redis matchmaking.

## Phase 6 — Redis matchmaking

- **Phase completed:** Implementation; critical live races pending.
- **Implemented:** Unique waiting ZSET, atomic Lua owner/heartbeat/join/leave/disconnect/current-peer/witness/block operations, finite sessions/leases/matches, stale cleanup, self/duplicate/mutual block exclusion, bounded queue, Next ordering and explicit peer notification.
- **Files created:** server/src/matchmaking/{scripts,store}.ts; live integration cases under server/integration/.
- **Files modified:** Real-time handler integration.
- **Dependencies added / database changes:** None.
- **Tests performed/passed:** Strict compilation. Live integration tests are supplied for service-equipped environments.
- **Failed / bugs found / bugs fixed:** Review found bounded first-100 scanning could starve later candidates in a queue capped at 1000; both candidate and stale cleanup scans now cover the full bounded queue.
- **Security/privacy:** Socket ownership fences prevent old disconnect callbacks deleting replacement state. Redis Cluster/multiple app nodes are not claimed supported.
- **Known limitations:** Live concurrency, stale leases, duplicate prevention and recovery NOT YET VERIFIED against Redis here.
- **Next phase:** WebRTC signaling.

## Phase 7 — WebRTC

- **Phase completed:** Implementation; real media checks pending.
- **Implemented:** Native peer connection, one offerer, answer, buffered early ICE, current-match-only signaling with server-selected peer, short-lived environment-driven TURN and STUN, credential refresh on each new search, negotiation timeout, stale callback rejection and peer cleanup.
- **Files created:** client/src/features/video-chat/PeerTransport.ts, client/tests/peer-transport.test.ts, server/src/realtime/signaling.ts.
- **Files modified:** Client controller and socket handler integration.
- **Dependencies added / database changes:** None.
- **Tests performed/passed:** Four peer lifecycle tests: early ICE/foreign-match rejection, late offer after close, independent video pause/resource release, finite negotiation timeout. Server/client strict compilation.
- **Failed / bugs found / bugs fixed:** Found pausing original local video would prevent detecting a returning face; outbound video now uses an independent clone. Normalize optional ICE fields for strict DOM types.
- **Security/privacy:** P2P IP exposure and external recording risk disclosed; media never passes through the app server. TURN signing secret kept server-only.
- **Known limitations:** Actual two-peer audio/video, NAT traversal, TURN relay, browser interoperability and slow networks NOT YET VERIFIED.
- **Next phase:** Chat controls and UI state integration.

## Phase 8 — chat controls and states

- **Phase completed:** Implementation and static/component layout review; live control checks pending.
- **Implemented:** Spacious remote-video stage, smaller local preview, compact mobile preview and fixed reachable controls; Next/Stop/mute/camera, connection/peer loss/reconnect/error states, remote audio autoplay fallback, report/block dialogs.
- **Files created:** client/src/pages/ChatRoom.tsx, client/src/components/{ConversationControls,RemoteVideo,ReportDialog,BlockDialog}.tsx, client/src/features/ErrorBoundary.tsx.
- **Files modified:** App, controller, CSS and main entry.
- **Dependencies added / database changes:** None.
- **Tests performed/passed:** TypeScript/lint; peer lifecycle regression tests. Idle chat-room component rendered in a labeled developer fixture; no live peer or media simulated as a working conversation.
- **Failed / bugs found / bugs fixed:** Next now remains available during face warnings/camera-off and closes old media immediately. Old Stop acknowledgements cannot change new session state; expiry/disconnect resets pending actions. Repeated loss after recovery rearms timeout. Report/block dialog captures target before a new peer arrives; late block ack cannot close another participant's call.
- **Security/privacy:** Only server-authorized matches can signal/report/block. Stop releases device tracks. No call recording.
- **Known limitations:** Actual two-peer Next/Stop/mute/camera/autoplay/reconnect behavior NOT YET VERIFIED.
- **Next phase:** Face-presence checks.

## Phase 9 — local face presence

- **Phase completed:** Implementation and actual Chrome worker/model initialization plus blank-frame inference.
- **Implemented:** Pinned MediaPipe model/WASM served locally; interval-based worker with one transient downscaled input at a time; warning/pause/disconnect grace thresholds; outbound clone pause permits local detector recovery. No identity or age recognition, no stored or uploaded frames.
- **Files created:** client/src/features/face-presence/{face.worker,useFacePresence,policy}.ts, scripts/prepare-face-assets.mjs, client/tests/face-policy.test.ts; generated ignored client/public/face assets.
- **Files modified:** Controller/media transport integration and build asset preparation.
- **Dependencies added / database changes:** MediaPipe dependency already installed in phase 1; none else.
- **Tests performed/passed:** Boundary-time policy test; actual Chrome module worker loaded model and inferred no face on a synthetic blank frame, with no worker error logs. Assets integrity validated against pinned model SHA-256.
- **Failed / bugs found / bugs fixed:** Independent review found classic WASM loader incompatible with module worker; switched to installed package module-loader option. Corrupt cached model now triggers bounded redownload; downloaded bytes are validated before atomic replacement.
- **Security/privacy:** Only presence boolean exits worker; transient ImageBitmap closed after inference. This is a fallible, bypassable client check; no adult/identity/behavior guarantee.
- **Known limitations:** Positive face detection, false-negative behavior, low light, slow devices, physical camera recovery and other browsers NOT YET VERIFIED. Lazy-loaded WASM costs approximately 11MB on first camera setup.
- **Next phase:** Moderation and abuse protection.

## Phase 10 — moderation and anti-abuse

- **Phase completed:** Implementation and unit/HTTP validation; live DB/Redis verification pending.
- **Implemented:** Recent-match-derived reports, constrained categories/description, parameterized SQL, unique report deduplication, session HMAC subjects, configurable retention, finite human-issued bans, mutual TTL blocks, early bounded local traffic budgets and authoritative Redis quotas. Blocks end a newer match with the same selected peer but preserve unrelated peers.
- **Files created:** server/src/moderation/{reports,ban-cli}.ts, server/src/realtime/{moderation,packet-budget}.ts, server/src/security/{client-address,traffic-budget}.ts, server/tests/{moderation,traffic-budget}.test.ts.
- **Files modified:** App/session/socket/queue handlers and npm moderation:ban script.
- **Dependencies added / database changes:** None beyond reports/bans migration.
- **Tests performed/passed:** 16 backend unit/HTTP tests: consent/origins/cookies/expiry, SQL parameterization/dedup, failed database reporting, trusted proxy bounds, early malformed-event/API budgets and bounded memory. No automatic ban from a report.
- **Failed / bugs found / bugs fixed:** Raw proxy socket address would share all-user rate buckets; explicit trusted-proxy policy now applies to sockets. Cheap packet/HTTP guards run before expensive auth/DB checks, covering malformed and unknown events. In-flight Redis stalls bounded by 20s transport timeout and 512 command queue cap; healthy prune heartbeat is 15s.
- **Security/privacy:** Process-local budgets have finite bounded storage and reset on restart; Redis feature quotas persist for their TTL. Raw IPs/tokens/media/signaling are not logged. Ban enforcement is evadable on anonymous sessions; network bans can affect NAT users. CLI is an operator capability, never exposed to anonymous clients.
- **Known limitations:** Live moderation persistence/retention/ban execution, queue races, outages and transport recovery NOT YET VERIFIED.
- **Next phase:** Consolidated QA.

## Phase 11 — QA

- **Phase completed:** Available automated and browser checks; full service/device matrix pending.
- **Implemented:** Strict build/lint/format commands, critical regression tests, explicit real-service integration suite, developer-only fixtures for local worker and CSS layout checks.
- **Files created:** server/integration/lifecycle.test.ts, client/tests/* and ignored client/verification/* fixtures.
- **Files modified:** Reviewed runtime modules and verification documentation.
- **Dependencies added / database changes:** None.
- **Tests performed/passed:** Final command totals are recorded in docs/verification.md. Desktop Chrome, native dialog behavior, real service-unavailable response and blank worker inference verified. Responsive fixtures exercise real 390px CSS layout; they do not emulate hardware or live calls. Phone controls are fixed within the viewport, at least 52px high, with labels at least 12px. Built-page FAQ/privacy dialog and Escape focus restoration passed with no fresh browser error/warning logs.
- **Failed / bugs found / bugs fixed:** Live integration intentionally skips without isolated INTEGRATION_DATABASE_URL/INTEGRATION_REDIS_URL. No lifecycle assertions are counted as passed in that skip. Reviewed/repaired bugs are listed above.
- **Security/privacy:** Defensive code review covered inputs, cookies, ownership, roles, origins, quotas, SQL, TTLs, trusted proxies, model assets and media cleanup. No media persistence sink found.
- **Known limitations:** Two actual browser contexts with live matching/media, actual TURN, live PostgreSQL/Redis, migration/retention, service fault injection, Safari/Firefox and real devices NOT YET VERIFIED.
- **Next phase:** Deployment preparation only.

## Phase 12 — deployment preparation

- **Phase completed:** Artifacts/documentation prepared; no deployment.
- **Implemented:** Non-root multi-stage Docker build, required secrets, private authenticated Redis/PostgreSQL, application DB role, explicit migration profile, loopback port exposure, local setup/pgAdmin instructions, HTTPS/TURN/proxy/monitoring/retention/scaling procedures and unresolved launch decisions.
- **Files created:** README.md, docs/{operations,safety-decisions}.md, compose.yaml and docker/{Dockerfile,Dockerfile.dockerignore,.env.example,init-db.sh,redis-entrypoint.sh,compose.local-ports.yaml}.
- **Files modified:** npm scripts and architecture/report documentation.
- **Dependencies added / database changes:** None; no containers/images/services installed or run.
- **Tests performed/passed:** Markdown/YAML formatting and static review; production build artifact generation. Compiled server served the built landing and WASM (application/wasm) with CSP and no-referrer headers on a loopback-only preview. The preview used ephemeral test TURN configuration, not a working relay or TLS deployment. Runtime container checks NOT YET VERIFIED.
- **Failed / bugs found / bugs fixed:** Docker and bash unavailable, so semantic Compose/container/shell execution not claimed.
- **Security/privacy:** Production requires HTTPS and configured TURN. Proxy must overwrite forwarded headers and prevent direct app bypass. Readiness should be infrastructure-restricted. Draft legal/safety notices and unstafﬁed moderation remain public-launch blockers.
- **Known limitations:** Infrastructure, TLS, real TURN, regional routing, provider logs, moderation operation and legal/age-assurance decisions NOT YET VERIFIED. Single backend only until distributed delivery and cleanup are implemented/tested.
- **Next phase:** Operator-provided local services and remaining live acceptance matrix; see verification.md. No public launch authorization requested or assumed.
