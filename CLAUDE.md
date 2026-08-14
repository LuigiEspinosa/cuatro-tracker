# Cuatro Tracker (Repo-Level)

This file supplements the workspace-root `CLAUDE.md`. Read that file first for project overview, git rules, and autonomy posture. This file covers stack-specific conventions for working inside this repo.

## Quick Commands

```bash
pnpm dev              # Start dev server (Turbopack)
pnpm infra            # Start Postgres + Redis via Docker Compose
pnpm infra:down       # Stop infra
pnpm build            # Production build
pnpm lint             # ESLint (zero warnings allowed)
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest unit/integration (single run)
pnpm exec tsx --env-file=.env worker.ts   # BullMQ worker (separate process; REQUIRED for pnpm test:e2e)
pnpm test:e2e         # Playwright end-to-end
pnpm prisma migrate dev   # Run pending migrations
pnpm prisma db seed       # Seed admin user
```

Full local e2e prerequisites, in order: `pnpm infra`, `pnpm prisma migrate deploy`, `pnpm prisma db seed`, a worker in its own terminal, then `pnpm test:e2e` (Playwright starts `pnpm dev` itself via `webServer`). Without the worker the seeded `/admin/import` spec hangs on its SSE progress page: nothing consumes the `bulkImport` job. CI starts one in the `e2e` job, where the job-level `env` block supplies the variables.

The worker entrypoint reads `lib/env.ts` at module load and nothing loads `.env` for it, so locally it needs `--env-file=.env` or it dies on Zod validation before the first log line. `next dev` and the Playwright runner do not: both call Next's own env loader.

## Directory Structure

```
app/
  (auth)/              # Login page
  (dev)/               # Dev fixtures (boot, flip, nav, frames, year)
  (media)/             # Media pages: movies/, tv/, anime/, manga/, games/
  api/                 # Route handlers: auth, dashboard, health, library, media, progress, ready, search
  layout.tsx           # Root layout with session gating + Sentry/Umami
  providers.tsx        # Client providers (QueryClient, Zustand, Lenis)
  page.tsx             # Dashboard (home)

components/
  atoms/               # BitmapText, CRTPixelButton, PhosphorBar, PhosphorLED, TerminalInput, etc.
  molecules/           # BootSequence, ChannelFlipTransition, CRTBezel, FilterChip, FramedCover, etc.

lib/
  api/                 # External API clients (TMDB, AniList, IGDB, Steam, Twitch)
  db/                  # Database helpers (library queries)
  hooks/               # Custom React hooks
  jobs/                # BullMQ queue registry
  normalise/           # Source API to MediaItem normalisation (movie, tv, anime, manga, game, release-date)
  search/              # Federated search: dispatcher, federation
  types/               # Shared TypeScript types (library, progress)
  auth.ts              # NextAuth v4 config (single source of truth)
  db.ts                # Prisma client singleton with graceful shutdown
  env.ts               # Zod env validation at boot
  logger.ts            # Pino structured logger with requestId
  redis.ts             # Shared ioredis client
  request-context.ts   # AsyncLocalStorage for requestId injection
  sentry-scrub.ts      # Event-redaction helper for Sentry

prisma/
  schema.prisma        # Database schema (see raw SQL constraints note in file)
  migrations/          # Committed migrations. Never edit after apply.
  seed.ts              # Admin user seeder

docker/
  Dockerfile           # Multi-stage: deps, builder, runner, worker
  Caddyfile            # Production reverse proxy
  Caddyfile.dev        # Dev reverse proxy

e2e/                   # Playwright tests
```

## Stack Traps (quick reference)

- **`params` and `searchParams` are async in Next 15.** Always `await params` before reading.
- **`redirect()` and `notFound()` throw.** Never wrap in try/catch.
- **Tailwind v4 is CSS-first.** Tokens go in `app/global.css` via `@theme`. No `tailwind.config.*` file.
- **Prisma 6 schema has raw SQL constraints** (CHECK, partial unique) that the Prisma DSL cannot express. Review any migration diff that touches constrained columns before applying.
- **BullMQ worker runs as a separate process.** Never import worker code from RSC. No top-level `await` in `lib/` modules used by the worker.
- **`fetch()` in Next 15 is not cached by default.** Opt in explicitly with `{ cache: 'force-cache' }` or `{ next: { revalidate: N } }`.
- **Zod v4** (not v3). Import as `import { z } from 'zod'`. Ignore the architecture guide's `zod/v4` subpath.
- **NextAuth v4** (not v5/Auth.js). Import from `next-auth/...`, not `@auth/core`.

## Testing Conventions

- **Framework:** Vitest with `environment: 'node'` and `globals: true` (runtime only). Suites still import `describe`/`it`/`expect` explicitly from `'vitest'`: tsconfig does not load the global types, so `pnpm typecheck` fails without the import. Matches every existing suite (Story 10.2 D9).
- **Colocation:** Tests live in `__tests__/` directories next to their source files.
- **Path alias:** `@/` is wired in `vitest.config.ts` and resolves from repo root.
- **Integration tests with real services:** Redis-dependent tests (BullMQ) use real Redis. DB tests use a real Postgres instance.
- **Mocking:** Mock external API calls (TMDB, AniList, IGDB, Steam). Never mock the database or Redis in integration tests.

### E2E seed helper contract (`e2e/fixtures/library-seed.ts`)

- **One Prisma client for the whole suite.** No spec file may call `new PrismaClient()`; import `seedDb` from the helper instead. `playwright.config.ts` calls `loadEnvConfig(process.cwd())`, so `DATABASE_URL` is already in the runner's env.
- **The helper owns two reserved namespaces.** Everything it writes carries a `MediaItem.id` starting `e2e-seed-` or a Steam appid inside the closed block `[E2E_STEAM_APPID_BASE, E2E_STEAM_APPID_BASE + E2E_STEAM_APPID_BLOCK)` (9000001 to 9001000). Cleanup deletes by that prefix and that block only, and the block is bounded on both ends because Steam's appid space is still growing upward. The one case where the helper removes rows it did not itself insert is that block: the import job writes them on the fixture's behalf, which is why the range is reserved. No function truncates a table or issues a bare `deleteMany({})`, so a full e2e run against a populated local library leaves it byte-identical. Do not widen a `where` clause in this module.
- **Every mutating function refuses a non-loopback database.** `assertLocalDatabase()` parses `DATABASE_URL` and throws unless the host is `localhost`, `127.0.0.1` or `::1`. This replaces the safety the removed `TIMELINE_E2E_SEEDED` gate used to provide: `pnpm test:e2e` now sweeps rows before the first test, so a `.env` aimed at the production box would otherwise be destructive. The guard is on the host, not the database name, because local and production are both named `tracker`. Override with `E2E_ALLOW_REMOTE_DB=1` only if you are certain.
- **Seed per describe, never globally.** `globalSetup` / `globalTeardown` only sweep leftovers. Specs seed in `beforeAll` and call `cleanupSeeded()` in `afterAll`. A global seed would break `admin-dashboard`'s `0 PENDING SUGGESTIONS` assertion (it runs first) and `timeline`'s LIBRARY EMPTY assertion (it runs last).
- **`workers: 1` is load-bearing, not a CI-only optimisation.** `fullyParallel: false` serialises only within a file; every spec shares one database, so spec files must run one at a time for describe-scoped cleanup to land before the next file's assertions.
- **Functions:** `seedTimelineLibrary()` (112 rows spanning 1985 to 2025, all five media types, one franchise group of 30; returns `{ totalRows, franchiseId, franchiseSize }` so specs assert against the helper's numbers, not literals), `seedMergePairs(count)`, `steamExportFixture(count)` (pure, no DB), `cleanupSeeded()`, `disconnectSeed()`. Each seeder clears its own subset first, so it is idempotent under a Playwright retry.

## Code Style (enforced)

- Single quotes, no semicolons (Prettier).
- `import type { ... }` for type-only imports. Mixed: `import { fn, type Foo } from '...'`.
- No `const enum` (incompatible with `isolatedModules`). Use string literal unions.
- No `.js` or `.ts` extensions in import specifiers.
- `async/await` over `.then()` chains. `Promise.all` for independent parallel work.
- Errors at system boundaries: try/catch with structured logging. Internal helpers let errors bubble.
- All external data flows through Zod before use.

## Pre-commit Checklist (Claude Code self-review)

1. `pnpm typecheck` passes
2. `pnpm lint` passes with zero warnings
3. `pnpm test` passes
4. New route handlers have corresponding tests in `__tests__/`
5. New components have tests if they contain logic
6. No `any` types introduced
7. No hardcoded secrets or env values
8. Commit message follows conventional commits format

Delivery notes are NOT tracked in this repo. The commit message on `dev` plus the per-story implementation artifact in `_bmad-output/implementation-artifacts/` are the durable per-story record.
