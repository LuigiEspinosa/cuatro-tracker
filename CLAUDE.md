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
pnpm test:e2e         # Playwright end-to-end
pnpm prisma migrate dev   # Run pending migrations
pnpm prisma db seed       # Seed admin user
```

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

- **Framework:** Vitest with `environment: 'node'` and `globals: true`. `describe`/`it`/`expect` are global, no imports needed.
- **Colocation:** Tests live in `__tests__/` directories next to their source files.
- **Path alias:** `@/` is wired in `vitest.config.ts` and resolves from repo root.
- **Integration tests with real services:** Redis-dependent tests (BullMQ) use real Redis. DB tests use a real Postgres instance.
- **Mocking:** Mock external API calls (TMDB, AniList, IGDB, Steam). Never mock the database or Redis in integration tests.

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
