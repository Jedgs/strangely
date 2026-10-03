# Verification record

The latest review is the [3 October 2026 system security/deployment review](security-review.md#verification-appendix--3-october-2026), including 69 unit tests and 7 passing real-store integration checks. The older record below is preserved as historical evidence; its unavailable-service and skipped-test statements describe the earlier workspace state.

Recorded on 1 October 2026 for the Commonroom development workspace. Implementation artifacts exist for all twelve phases. The complete live-service and real-device definition of done is **not yet met**.

## Automated checks

| Check                          | Result                           | Scope                                                                                                                                           |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run build`            | PASS                             | Local face assets with pinned model hash; strict client/server TypeScript; Vite client and compiled server.                                     |
| `npm.cmd run lint`             | PASS                             | Client, server, shared contracts and scripts.                                                                                                   |
| `npm.cmd test`                 | PASS: 27 tests in 7 files        | Environment validation, consent/session HTTP behavior, moderation, traffic limits, face timing, peer lifecycle and simulated transport failure. |
| `npm.cmd run format:check`     | PASS                             | Project source, configuration and documentation.                                                                                                |
| `npm.cmd audit`                | PASS: 0 reported vulnerabilities | Locked npm dependency graph at the time of this check; this is not a security guarantee.                                                        |
| `npm.cmd run test:integration` | SKIP: 1 test; 0 passed           | Isolated PostgreSQL/Redis integration URLs and services unavailable. No lifecycle assertions counted as passed.                                 |
| `npm.cmd run check:services`   | FAIL, expected in this workspace | PostgreSQL and Redis unavailable on configured local endpoints.                                                                                 |

The added Redis deadline test uses a native loopback RESP transport fixture. It answers initialization and deliberately withholds a PING reply. The configured client rejects the in-flight command near 20 seconds and rejects offline commands promptly. The fixture implements no Redis state, persistence or Lua; it does **not** validate real Redis matchmaking.

The production output includes approximately 398KB of main JavaScript (121KB gzip), 24.5KB CSS (6KB gzip), and a separate 154KB face worker. Approximately 11MB of WASM is loaded during camera setup, not on the landing page. These are build measurements, not mobile performance benchmarks.

## Browser and runtime checks

| Check                          | Observed result                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop Chrome landing         | Original visual layout rendered; navigation, CTA, FAQ disclosure and privacy dialog checked.                                                                                                                             |
| Consent dialog                 | Continue disabled until all four development consent selections; an actual unavailable-service response shows a retryable error and retains selections. No camera permission granted.                                    |
| Keyboard dialog behavior       | Escape closes the native dialog and restores focus to its triggering button.                                                                                                                                             |
| Fresh built-page console       | No captured error or warning logs during landing, FAQ and privacy-dialog checks. Historical development HMR errors do not represent a fresh-page pass; the fresh built tab was checked separately.                       |
| 390px CSS landing and consent  | No horizontal overflow; consent fits its viewport and scrolls its content.                                                                                                                                               |
| 390px idle chat-room component | Actual component rendered in a clearly labeled developer fixture, without a peer or media. Fixed toolbar within the viewport; controls at least 52px high, labels at least 12px.                                         |
| Face worker                    | Actual MediaPipe module worker initialized local model/WASM and inferred no face on a synthetic blank frame, without worker error logs.                                                                                  |
| Compiled server                | Built landing served with HTTP 200, CSP and no-referrer headers; WASM served with HTTP 200 and `application/wasm`. Loopback-only preview used ephemeral test TURN settings, not a functioning relay or HTTPS deployment. |
| Service failure                | Liveness responds 200; readiness responds 503 with services absent. The interface does not claim a submitted report or successful session when the backend fails.                                                        |

Phone checks used same-origin iframes with an actual 390×844 CSS viewport because the available browser viewport override did not change Chrome's reported viewport. They verify responsive CSS, not physical hardware, touch behavior or a mobile browser engine. Developer fixtures are ignored verification files and are excluded from the production bundle. A desktop screenshot is saved locally at `verification/landing.png`.

## Security and privacy review

Review covered exact origins, HttpOnly cookies and random opaque sessions, per-event authorization and socket ownership, server-derived peers/report subjects, bounded payloads and work queues, local traffic budgets and Redis quotas, parameterized SQL, deduplication, key/record expiry, explicit proxy trust, safe errors/logging, environment validation, model integrity, short-lived TURN credentials, stale callback guards and device/peer cleanup.

No application persistence sink for video, audio, camera frames, face images or biometric profiles was found. Only face-presence results leave the local worker. Network/session HMAC references remain pseudonymous data. Other participants and infrastructure providers can observe network metadata or record outside the application.

Review is not proof of immunity to abuse. Self-declared age and client-side face presence can be bypassed. Anonymous bans are evadable; network bans can affect shared connections. An operator still needs stronger age-assurance decisions, staffed moderation, escalation/contact/appeal procedures and finalized notices before public use.

## NOT YET VERIFIED

- Live PostgreSQL connection, migration application/rollback, moderation persistence, retention and ban operation.
- Real Redis Lua execution, simultaneous joins/Next, queue uniqueness, leases/fencing, block exclusions, stale cleanup and outage/recovery behavior.
- Two independent browser contexts performing live Socket.IO matching and actual bidirectional camera/audio WebRTC.
- TURN authentication, relay-only selected route, NAT traversal, network changes and restrictive/slow networks.
- Physical camera/microphone permissions, denial/missing-device behavior, mute/camera controls and track release across the full browser flow.
- Positive face inference, low light, false negatives, slow devices and camera recovery.
- Safari, Firefox, real phones/tablets and at least two browser engines with real media.
- Docker build/Compose runtime, container migrations, TLS/proxy deployment, backups/restore and production monitoring.

The [README](../README.md) explains local PostgreSQL/pgAdmin and Redis setup, configuration, migrations and the two-browser acceptance matrix. The [operations guide](operations.md) covers deployment preparation; [safety decisions](safety-decisions.md) records unresolved launch choices. No production deployment was performed.
