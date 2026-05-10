# Changelog

## [Unreleased] - Phase 2 hardening closeout (Sprint 1)

Sprint 1 closes Epic 1 (Phase 2 Hardening + Operability), 23 stories across env validation, observability baseline, auth hardening, CI restructure, deploy automation, and worker scaffold.

### Added

- Sentry error tracking on server, worker, and client with `beforeSend` scrub for `Authorization`/`Cookie` headers, `request.body`, `user.email`, and any field matching `password`/`secret`/`token`/`apikey`/`authorization` at any depth (1.18)
- Umami analytics conditionally injected on authenticated routes only (1.19)
- BullMQ worker process scaffold (`worker.ts`) running as `worker` sidecar service; graceful SIGTERM drain (1.23)
- `lib/jobs/queues.ts` queue registry (initially empty; populated by Stories 9.1, 9.2, 11.5, 11.6)
- Image CDN whitelist for AniList (`s4.anilist.co`), Steam (`cdn.cloudflare.steamstatic.com`, `media.steampowered.com`), IGDB (`images.igdb.com`) (1.22)
- Caddy security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` on every response (1.21)
- App container healthcheck + Caddy `depends_on: { condition: service_healthy }` + Dockerfile `HEALTHCHECK` directive (1.17)
- Post-deploy `/api/health` curl-retry (5 attempts, 5s spacing) in `deploy.yml` (1.16)
- Graceful SIGTERM/SIGINT shutdown for Prisma + Redis in `lib/db.ts`; pairs with `closeRedis()` from Story 1.7 (1.21)
- `app/api/health` route handler — liveness probe, no auth, no DB check (1.8)
- `app/api/ready` route handler — readiness probe with db + redis health checks (1.9)
- Pino structured logger with `requestId` injection via AsyncLocalStorage (1.6)
- Shared ioredis client at `lib/redis.ts` with `maxRetriesPerRequest: null` for BullMQ compatibility (1.7)
- `lib/sentry-scrub.ts` shared event-redaction helper (server + worker + client)
- `instrumentation.ts` Next.js Sentry server init; `instrumentation-client.ts` client init
- BullMQ worker integration test (real Redis): asserts processor invocation + `Worker.close()` drains in-flight (1.23)
- Config-shape contract test for `next.config.ts` `images.remotePatterns` (1.22)
- 18 auth-spec tests covering DB-down propagation, email normalisation, OAuth-only-user short-circuit, bcrypt-rejection, token.id validation (1.13, 1.14)
- GitHub Project board with `Backlog`/`In Progress`/`In Review`/`Done` columns + automation rules (1.20)
- `docs/operations.md` (workspace root) — operator runbook for endpoints, healthchecks, Sentry, Umami, Uptime Kuma, deployment, rollback (1.19)

### Changed

- CI: full restructure with concurrency cancellation; lint + build steps added; typecheck reordered before tests; `pnpm lint` migrated from deprecated `next lint` to `eslint . --max-warnings=0` with explicit `ignores` block; `services: redis` block added alongside postgres for the Build step (1.15)
- `lib/env.ts`: Zod env validation at boot; `SENTRY_DSN` added optional with empty-string preprocessing for compose `${SENTRY_DSN:-}` interaction (1.1, 1.18)
- `lib/auth.ts`: `bcrypt.compare` wrapped in try/catch with warn-log; session-callback `token.id` strict typeof + non-empty validation; `NEXTAUTH_SECRET` asserted at module load via `lib/env.ts` (1.11, 1.13)
- `next.config.ts`: `poweredByHeader: false`; `images.remotePatterns` extended for E8 + E9 cover-image CDNs (1.21, 1.22)
- `docker-compose.yml`: fail-fast `${VAR:?msg}` syntax on every required var (1.2); pre-existing `DB_PASS` env-chain gap fixed in app + worker service env lists; new `worker` sidecar service with same image as `app` (1.23); app healthcheck + Caddy depends_on (1.17); `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` env vars added to app service (1.18, 1.19)
- `docker-compose.dev.yml`: Postgres bound to `127.0.0.1:5432:5432` loopback only (1.3)
- `docker/Dockerfile`: `HEALTHCHECK --interval=30s --timeout=5s --start-period=20s` directive in runner stage; new `worker` build target running `tsx worker.ts` (1.17, 1.23)
- `docker/Dockerfile.caddy`: builder + runtime pinned to `caddy:2.11.2`; `caddy-dns/cloudflare` plugin pinned to `v0.2.1` (1.21)
- `docker/Caddyfile` and `Caddyfile.dev`: security-header block added (1.21)
- `eslint.config.mjs`: top-level `ignores` block for `.next/**`, `node_modules/**`, `public/**`, `coverage/**`, `next-env.d.ts`, `**/*.tsbuildinfo`; `@typescript-eslint/no-unused-vars` rule with `argsIgnorePattern '^_'`, `varsIgnorePattern '^_'`, `caughtErrorsIgnorePattern '^_'`, `destructuredArrayIgnorePattern '^_'`, `ignoreRestSiblings: true`; targeted override for `app/layout.tsx` and `instrumentation-client.ts` to permit `process.env.NEXT_PUBLIC_*` reads (1.15, this bundle)
- `app/layout.tsx`: server-side session check via `getServerSession()` for Umami gating; wrapped in try/catch so DB-down doesn't 500 every page (1.19, this bundle)
- `package.json`: added `@sentry/nextjs ^10.52.0`; bumped `ioredis` to `^5.10.1` with `pnpm.overrides` to dedupe across @sentry/nextjs and bullmq peer deps (1.18)
- `prisma/seed.ts`: `ADMIN_PASS` fallback removed; exit-code propagation tightened (1.5)
- `prisma/schema.prisma`: phase 2 constraint hardening migration (CHECK constraints, partial unique, raw-SQL drift mitigation per `reference_prisma_raw_sql_drift_mitigation.md`) (1.12)
- `middleware.ts`: matcher uses segment-anchored lookahead so `/loginz` cannot bypass auth (1.10)
- `.github/workflows/deploy.yml`: `worklow_run` typo fixed + `concurrency: deploy-prod, cancel-in-progress: false` + post-deploy curl-retry against `/api/health` (1.4, 1.16)
- `.env.example`: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` added (1.18, 1.19)

### Fixed

- Auth: `bcrypt.compare` errors on a corrupted password column no longer 500 the login endpoint (1.13)
- Auth: malformed JWT carrying non-string or empty-string `token.id` no longer silently produces a session whose `user.id === ''` (1.13)
- Middleware: bypass via path-prefix shadowing (e.g. `/loginz`) closed (1.10)
- env: missing required env vars caught at module-load via Zod, not at first request (1.1)
- compose: missing required env vars fail at `docker compose up` time, not at app-start (1.2)
- next-lint deprecation: migrated to ESLint CLI before Next 16 removes `next lint` (1.15)
- Pre-existing `DB_PASS` env-chain gap in app service env list (this bundle, surfaced during 1.18 env-chain work)
- Pre-existing `_req` unused-vars warning at `app/api/ready/route.ts:23` resolved via config-level `argsIgnorePattern: '^_'` (1.15)
- `closeRedis()` no longer throws when redis was never connected (lazyConnect tests, never-touched-redis paths)

## [0.2.0] - 2026-04-03

### Added

- NextAuth v4 with credentials provider (email + password). JWT session strategy.
- Route middleware protecting all app and API routes. Login page at `/login`.
- Prisma admin user seed (`prisma/seed.ts`).

### Fixed

- `prisma/schema.prisma`: `release_date` is now non-nullable at the DB level.
- `prisma/schema.prisma`: `Achievement.game_id` has a proper FK relation ith `onDelete: Cascade`.
- `prisma/schema.prisma`: `MergeSuggestion.source_id` and `target_id` have FK relations.
- `prisma/schema.prisma`: `MediaItem.parent` self-relation has explicit `onDelete: SetNull`.
- `lib/auth.ts`: Email is normalized to lowercase before DB lookup.
- `lib/auth.ts`: Null email guard added before returning user object from `authorizeCredentials`.
- `lib/auth.ts`: Typo `'passwird'` corrected to `'password'` on credentials field type.
- `lib/auth.ts`: `token.id` cast guarded with nullish coalescing.
- `middleware.ts`: `/api/health` and `/api/ready` excluded from auth protection.
- `lib/db.ts`: PrismaClient cached on `globalThis` in all environments.

## [0.2.0] - 2026-04-02

### Added

- NextAuth v4 credentials provider with Prisma adapter and JWT session strategy.
- `authorizeCredentials` exported from `lib/auth.ts` for unit testing without booting NextAuth.
- Route middleware (`middleware.ts`) protecting all routes except `/login` and `/api/auth/*`.
- Login page at `/login` with email/password form and inline error feedback.
- `SessionProvider` added to `app/providers.tsx`.
- Five unit tests for  `authorizeCredentials` covering missing credentials, unknown user, wrong password, and valid sign-in.

### Fixed

- `staleTime` in TanStack Query config was `60 * 100` (6s), corrected to `60 * 1000` (60s).

## [0.1.1] - 2026-02-25

### Fixed

- Docker: copy `prisma/` before `pnpm install` so postinstall `prisma generate` finds the schema
- Docker: add `export default nextConfig` to produce `.next/standalone` output
- Docker: add postgres and redis healthchecks for `service_healthy` dependency conditions
- Docker: add `migrate` service (builder stage) that runs `prisma migrate deploy` before app starts
- Docker: switch Caddy DNS-01 provider from Hetzner to Cloudflare (Hetzner plugin requires apex zone)
- CI: fix typos in healthcheck flags (`--health-internal`, `--health-retires`) and `DATABASE_URL` username
- CI: remove `version:` from pnpm action-setup (conflicts with `packageManager` in package.json)
- CI: remove `cache: pnpm` from setup-node (incompatible with action-setup install path)
- CI: remove incorrect `working-directory: cuatro-tracker` (repo root is the app root)

## [0.1.0] - 2026-02-25

### Added

- Next.js 15 App Router scaffold with TypeScript 5.7 strict mode and `moduleResolution: bundler`.
- pnpm as package manager. Removed yarn.lock.
- Tailwind CSS v4 CSS-first setup (`@import "tailwindcss"`, no `tailwind.config.js`).
- TanStack Query v5 `Providers` wrapper in `app/providers.tsx`.
- Unified Prisma 6 schema with `MediaItem`, `UserEntry`, `Achievement`, and `MergeSuggestion` models.
- NextAuth v4 schema models (`User`, `Account`, `Session`, `VerificationToken`). `User.password` field for credentials provider.
- `lib/db.ts` Prisma singleton with `globalThis` pattern to avoid connection pool exhaustion on hot reload.
- `prisma/seed.ts` seeds a single admin user (hashed with bcryptjs).
- Docker setup: multi-stage `Dockerfile` (node:22-alpine, standalone Next.js output), `docker-compose.yml` with postgres, redis, caddy, and qbittorrent services, `Caddyfile` with auto-HTTPS.
- `.env.example` with all required variables documented.
- GitHub Actions `ci.yml`: installs, migrates, tests, and typechecks on every push and PR.
- GitHub Actions `deploy.yml`: SSHes into VPS and rebuilds Docker stack after CI passes on `main`.
- `vitest.config.ts` with path alias `@/*` mirroring `tsconfig.json`.
- `next.config.ts` with `output: standalone` and TMDB/IGDB/AniList image remote patterns.

### Removed

- Next.js 13 Pages Router scaffold (old `pages/`, `styles/`, `constants/`, `utils/`).
- Yarn lockfile.
- Old Tailwind v3 config files (`tailwind.config.js`, `postcss.config.js`).
- Old Supabase-era `DIRECT_URL` env requirement from Prisma datasource.
- Old separate media models (`Movie`, `Episode`, `UserMovie`, `UserEpisode`, `MovieComment`) replaced by the unified `MediaItem` + `UserEntry` pattern.
