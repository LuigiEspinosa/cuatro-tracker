# Cuatro Tracker

## Features

- Auth with NextAuth (GitHub provider by default)
- Supabase Postgres via Prisma (NextAuth models)
- TMDB v3 integration (Popular, Trending, Release date sorting, Search)
- Per‑user tracking (watchlist, watching, completed, dropped) + rating/notes
- Server Actions/Route Handlers for secure writes, cached TMDB reads
- Type‑safe TMDB client, minimal server‑side caching
- Tailwind UI, responsive grid, accessible components
- Vitest unit tests for core utils
- Vercel‑ready

## How I approached it

## 1. Data model first

I defined Prisma models for the NextAuth tables (User/Account/Session/VerificationToken) plus two app tables:

- `Movie` caches minimal TMDB fields you'll reuse (title, dates, poster, popularity).
- `UserMovie` ties a user to a tmdbId with status, optional rating and notes. Unique on (userId, tmdbId) so each user has exactly one record per movie.

### 2. Auth + DB plumbing

- NextAuth with the PrismaAdapter, `session: 'jwt'` for simplicity.
- GitHub provider as a working example.
- Prisma client with the standard dev "global" reuse pattern.

### 3. TMDB integration

- A tiny typed client in `lib/tmdb.ts` with helpers for popular, trending, discover (release desc), and search.
- Responses are SSR-fetched (server) with a 60s revalidate to be kind to TMDB.

### 4. Tracking flow

- `POST /api/track` accepts a minimal movie payload + desired status.
- It upserts the Movie cache, then upserts the UserMovie row.
- `GET /api/me/list` returns the signed-in user's list and supports status and sort (release, popularity, updated).

### 5. UI

- Home page has sort tabs (Popular/Trending/Newest) and a responsive grid of MovieCards.
- Search page uses TMDB search.
- Watchlist page reads the signed-in user's list and lets you sort by updated/release/popularity.

### 6. Tests

- Vitest configured.
