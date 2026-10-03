# Strangely operator console

The console is at `/developer` on the frontend. It does not use the chat cookie. Production startup requires an operator password hash and TOTP MFA, plus provider age mode. Local access starts disabled until you choose credentials.

## Local setup

Run this in your own terminal from the repository root:

```powershell
npm run admin:setup
```

The prompt hides your passphrase and confirms it before saving a salted scrypt hash in the ignored `.env`. The tool refuses to overwrite existing credentials. The hash is single-quoted in the file so Docker Compose does not interpolate its dollar signs; paste the value without those enclosing quotes into hosting variables. It generates a private TOTP secret for your authenticator: SHA1, six digits, 30-second steps. Store recovery information securely. Do not share the secret or `.env` in chat, screenshots, or GitHub. Stop and restart your existing `npm run dev` task after setup: Node's module watcher does not watch `.env`. Compiled servers also need a deliberate restart after environment changes. Sign in at `http://127.0.0.1:5173/developer` using that passphrase and the authenticator code.

For hosting, copy `ADMIN_PASSWORD_HASH` and `ADMIN_TOTP_SECRET` directly from your secure local configuration into backend environment variables. Nothing belongs in `VITE_*`. Restrict console/API access through your trusted access gateway when practical. The frontend and API must use HTTPS under the same site as described in [deployment](deployment.md).

## Controls

- Active sessions: pseudonymous references, authenticated connection state, assurance, connection time and optional approximate country. Up to 100 displayed; active count includes all connected chat sockets on the single instance. `matched` means server matchmaking, not verified live media.
- Restrict session: ends that session immediately and denies it until expiry. New anonymous sessions can evade session-only restrictions.
- Restrict network: can affect unrelated people sharing an address; verify context, prefer short durations and use the confirmation/reason form. VPN changes can evade network restrictions.
- User reports: most recent 100 open reports; review, dismiss or restrict the witnessed subject. No image or recording attachments. Clearing a page by reviewing items exposes further open reports on refresh.
- Security events: 50 per page with keyset pagination and JSON page export. Severity describes a technical signal, not proof of criminal behavior. Repeated attempts are sampled to control cost.
- Restrictions: view/revoke up to 100 most recent active restrictions. Reversal notes and operator actions remain recorded.

The browser refreshes current data every minute while visible. Selecting older log pages pauses automatic refresh. Sign out revokes the grant; sessions expire after 30 minutes. Password/MFA changes invalidate prior grants when the restarted backend uses the new config. Login attempts, OTP replay and admin actions are rate-limited. MFA enrollment/recovery is local operator work, not a public API.

Schedule retention daily: `npm run db:retention` from the source repository root locally, or the same command inside `/app/server` in the built backend container (compiled script). Configure database backups, separate migration/runtime roles with minimum table privileges, access permissions and restore tests. Do not use the console as an automated surveillance or guilt-scoring system. Define staffed moderation, child-safety escalation and appeals before launch.

## Age-verification integration boundary

There is no real provider account configured. **Do not set provider mode merely to bypass the launch guard.** A server-side verification gateway must integrate a suitable vendor and validate its actual signed/API-authenticated decision, threshold, liveness/identity policy and replay rules. [Yoti's documentation](https://developers.yoti.com/age-verification/headless-idv) is one reference for an ID-based age check; it is not configured in this repository. Camera estimation alone has limitations described in [Yoti's overview](https://developers.yoti.com/age-estimation/overview).

Configure the backend only after building/testing that gateway:

```dotenv
AGE_MODE=provider
AGE_VERIFICATION_URL=https://your-trusted-gateway.example/start
AGE_WEBHOOK_SECRET=<strong shared gateway secret>
```

Strangely opens the configured HTTPS gateway with `reference=<random challenge>` and a same-site frontend `returnUrl`. The gateway must not accept a URL/query checkbox as a verified result. It must independently complete the vendor flow and then POST the decision to `/api/age/result` using this strict JSON contract:

```json
{
  "challenge": "<the 43-character reference>",
  "adultVerified": true,
  "timestamp": 1790985600,
  "signature": "<64-character lowercase hex HMAC-SHA256>"
}
```

The signature input is the exact UTF-8 string `timestamp + "\n" + challenge + "\n" + (adultVerified ? "adult" : "denied")`, keyed by `AGE_WEBHOOK_SECRET`. Timestamp is Unix seconds within 60 seconds of the backend clock. The gateway should use TLS, synchronize clocks, authenticate vendor responses, enforce an 18+ threshold, and sign denied outcomes too. This is **our gateway contract**, not Yoti's native callback format. Do not store/send birth dates, raw IDs, selfies or verification vendor secrets to Strangely's browser.

The challenge expires after 10 minutes, belongs to the browser's HttpOnly cookie and keyed network reference, changes from pending once, and an approved grant is consumed once on session creation. Network changes require a fresh check. Replayed, unsigned, expired, unapproved or different-network grants fail closed. The frontend return opens the notices again; it never accepts a returned query parameter as proof. Existing self-declared sessions cannot authenticate in provider mode.

Verified access does not establish the age of every person who later appears on camera. Multiple detected faces pause outgoing video locally, but face presence is bypassable and not an age classifier. Keep the minors prohibition and report route, and establish trained moderation and escalation procedures.
