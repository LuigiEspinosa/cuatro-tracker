# Changelog

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
