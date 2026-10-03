# Deploy Strangely: Vercel frontend + Railway backend

The repository uses npm workspaces. Keep `client/`, `server/`, `shared/`, the root manifests, and scripts together in one GitHub repository. The frontend and backend have separate dependencies, commands, outputs, and deployment settings. The shared directory contains API contracts; it contains no server credentials. The backend image does not include the React application or its dependencies.

## Recommended hosting

Use **Vercel for the frontend**, and **Railway for one backend service, PostgreSQL, and Redis in the same project/region**. This fits the existing persistent Fastify/Socket.IO process and Redis Lua matchmaking. Railway documents [Socket.IO deployment](https://docs.railway.com/guides/socketio), [PostgreSQL](https://docs.railway.com/databases/postgresql), and [Redis](https://docs.railway.com/databases/redis).

Render is an alternative for a persistent web service with [WebSocket support](https://render.com/docs/websocket), Render Postgres, and Redis-compatible Key Value. Choose an always-running backend for public calls. Review current provider pricing before creating paid services; this change does not create or deploy any infrastructure.

Railway's standard database templates are [unmanaged](https://docs.railway.com/databases): configure backups, monitoring, maintenance, and access controls. Enable backups and verify restoration before storing production moderation records. Start with one backend replica; this application does not yet have distributed Socket.IO routing or aggregate presence across replicas.

## Domains and session cookies

Use HTTPS subdomains of **one domain you own**, for example:

| Service            | Example origin                |
| ------------------ | ----------------------------- |
| Frontend on Vercel | `https://app.your-domain.com` |
| Backend on Railway | `https://api.your-domain.com` |

The services are different origins, so API requests use credentialed, exact-origin CORS. They are the same site, so the existing host-only `HttpOnly; Secure; SameSite=Strict` session cookie works without storing credentials in browser JavaScript. Both origins must use HTTPS. No shared parent-domain cookie is needed.

**A `*.vercel.app` frontend and an unrelated `*.up.railway.app` backend are different sites. Their chat session flow is not supported by this Strict-cookie configuration.** The landing assets can load, but authenticated chat will not work reliably with that domain pair. Configure the matching custom subdomains before testing production sessions. Changing a cookie to `SameSite=None` is insufficient on browsers that block third-party cookies. See [MDN cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) and [credentialed CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

Vercel preview origins are intentionally not automatically trusted. Use a separate staging backend with its `CLIENT_URL` set to a stable staging frontend under the same domain.

## GitHub preparation

Commit the source, root `package-lock.json`, workspace manifests, `client/vercel.json`, `server/Dockerfile`, and `railway.json`. Keep the complete monorepo accessible to both builders; do not upload only `client/` or only `server/`.

The existing `.gitignore` excludes `.env` files, dependencies, generated builds, face assets, and verification captures. `.env.example` files are safe templates. Check the staged files before pushing. Put production secrets in Railway's variables UI, never in GitHub or any `VITE_*` variable.

## Vercel frontend settings

Create two Vercel projects from the same GitHub repository. They use the same `client` Root Directory and lockfile, but different build-time surfaces:

| Project            | Custom domain           | `VITE_SURFACE` | Result                                                                  |
| ------------------ | ----------------------- | -------------- | ----------------------------------------------------------------------- |
| Strangely app      | `app.your-domain.com`   | `public`       | Consumer landing, consent and chat; `/developer` is not selected        |
| Strangely operator | `admin.your-domain.com` | `admin`        | Operator console only; every route renders the protected sign-in screen |

Set `VITE_API_URL` on both projects to the same HTTPS API origin. The `admin` surface is a separate deployment boundary and hostname, but its API access is still protected by the backend admin cookie and MFA. Do not treat the separate hostname as authorization by itself. In Vercel, create the second project with **Import Git Repository**, set Root Directory to `client`, enable **Include source files outside Root Directory**, and add `VITE_SURFACE=admin` before the first deployment. The public project uses `VITE_SURFACE=public`.

Import the GitHub repository and select:

| Setting                                     | Value                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Root Directory                              | `client`                                                                              |
| Framework Preset                            | Vite                                                                                  |
| Node.js version                             | `24.x`                                                                                |
| Include source files outside Root Directory | Enabled; shared contracts and build scripts are in the parent directory               |
| Install Command                             | Automatic npm workspace installation from the root lockfile; leave the override unset |
| Build Command                               | `npm run build`                                                                       |
| Output Directory                            | `dist`                                                                                |
| Production environment variable             | `VITE_API_URL=https://api.your-domain.com`                                            |

`client/vercel.json` supplies the build/output settings and security headers. The build downloads the pinned face model if it is not cached, verifies its hash, and copies the WASM assets to the frontend output. It also emits a CSP allowing REST and WebSockets only to the configured API origin. A missing or non-HTTPS production API origin stops the build with an actionable error.

Add the frontend custom domain in Vercel and apply its requested DNS records. Rebuild when `VITE_API_URL` changes: Vite embeds it at build time. Do not append `/api` or `/socket.io` to this variable.

See Vercel's [monorepo guide](https://vercel.com/docs/monorepos), [shared-source FAQ](https://vercel.com/docs/monorepos/monorepo-faq), [build settings](https://vercel.com/docs/builds/configure-a-build), and [supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Railway backend settings

1. Create a project and add PostgreSQL and Redis services. Use their internal connection URLs from the backend service in the same project/region.
2. Add a service connected to the same GitHub repository. Keep its Root Directory at `/`, because the Docker build needs the shared contracts and lockfile.
3. Use the checked-in `/railway.json`. It builds `server/Dockerfile`, runs the compiled migrations before starting, and checks `/api/health/ready`. The production image runs as a non-root user and installs only backend/shared runtime dependencies.
4. Configure the variables below before deployment. Add the backend custom domain and follow Railway's DNS instructions.
5. Keep one replica. Disable optional application sleeping/serverless behavior for the persistent chat backend.

| Backend variable       | Value or source                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`             | `production`                                                                                         |
| `HOST`                 | `0.0.0.0` (also set in the image)                                                                    |
| `PORT`                 | Railway-assigned port; the application reads it                                                      |
| `CLIENT_URL`           | Exact frontend origin, e.g. `https://app.your-domain.com`                                            |
| `DATABASE_URL`         | `${{Postgres.DATABASE_URL}}` if the database service is named `Postgres`                             |
| `REDIS_URL`            | `${{Redis.REDIS_URL}}` if the Redis service is named `Redis`                                         |
| `SESSION_SECRET`       | Newly generated random value, at least 32 characters                                                 |
| `ADMIN_PASSWORD_HASH`  | Salted scrypt hash from `npm run admin:setup`; server only                                           |
| `ADMIN_TOTP_SECRET`    | Private authenticator secret from operator setup; required in production                             |
| `AGE_MODE`             | `provider`; self-declared development mode cannot start production                                   |
| `AGE_VERIFICATION_URL` | Your tested HTTPS verification gateway start endpoint                                                |
| `AGE_WEBHOOK_SECRET`   | Strong gateway signing secret; server only                                                           |
| `TURN_SERVER_URL`      | Real `turn:` or `turns:` endpoint compatible with Coturn REST credentials                            |
| `TURN_SHARED_SECRET`   | The TURN server's matching strong shared secret, server-only                                         |
| `ICE_TRANSPORT_POLICY` | `all` for direct media with TURN fallback; `relay` if all media must use TURN                        |
| `TRUST_PROXY`          | Keep `false` until the hosting proxy's forwarded-header behavior and restricted ingress are verified |

Use the actual service names in Railway's reference variables. Other timing/retention settings can use the defaults in the root `.env.example`.

Generate the session secret locally and paste it directly into Railway:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not paste the generated value into chat. The application retains its production HTTPS and TURN requirements. PostgreSQL and Redis do not replace TURN: TURN relays media when peer-to-peer connectivity fails. Provision a compatible TURN service separately; a normal HTTP backend service is not a UDP media relay. Keep `TURN_SHARED_SECRET` out of the frontend; the backend issues temporary TURN credentials after consent.

If hosting on Render instead, use the repository root as Docker context and `server/Dockerfile` as the Dockerfile path, with equivalent variables, one web-service instance, the same readiness path, and a migration/pre-deploy command of `npm run db:migrate` inside `/app/server`.

## Local commands

Run from the repository root:

```powershell
npm ci
npm run dev
```

The root `.env` remains backend-only local configuration. The frontend reads only `client/.env*` public configuration; blank `VITE_API_URL` uses the development proxy. To test direct cross-origin access locally, set `VITE_API_URL=http://127.0.0.1:3001` in `client/.env.development.local` and retain `CLIENT_URL=http://127.0.0.1:5173` in the backend `.env`.

Build both deployment outputs locally with an example public origin:

```powershell
$env:VITE_API_URL = 'https://api.your-domain.com'
npm run build
```

Separate commands are `npm run build:client`, `npm run build:server`, `npm run dev:client`, and `npm run dev:server`. The frontend output is `client/dist/`; the backend output is `server/dist/`. `npm run start:server` starts the compiled backend. Local migrations use `npm run db:migrate`; deployed compiled migrations use `npm run db:migrate --workspace @strangely/backend` after building.

The example build URL is a placeholder, not a working service. Use the real public API origin when deploying.

See [operator setup and the gateway contract](operator-console.md). There is no real age provider configured. Public startup now fails closed without provider settings and admin MFA; do not set placeholder values simply to bypass the guard.

## Verify after deployment

1. Confirm `/api/health/ready` returns 200 and migrations succeeded with the intended production database.
2. Load the custom frontend domain; check the active-user badge and API responses in browser network tools.
3. Confirm all notices yourself, then check that the API sets a Secure/HttpOnly/Strict cookie on the API hostname and Socket.IO reaches `session:ready`.
4. Test with two real devices: camera/microphone permission, matching, audio/video, Next, End, Report/Block, reconnect, and cleanup.
5. Verify a TURN connection on different/restricted networks, including iOS Safari. Check cookie and CORS errors rather than loosening the origin policy.
6. Verify trusted proxy/client IP handling before enabling `TRUST_PROXY`; rate limits and network bans depend on it. Verify backups, domain TLS, and current public-launch requirements in the existing operations/safety documents.

Local builds, tests, and a local image build do not count as successful Vercel/Railway deployment or real TURN/media verification.
