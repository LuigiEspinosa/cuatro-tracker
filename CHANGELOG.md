# Changelog

All notable changes to this project will be documented in this file.

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
