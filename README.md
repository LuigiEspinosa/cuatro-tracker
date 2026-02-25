# Cuatro Tracker

A self-hosted, privacy-first media tracker. Tracks movies, TV shows, anime, manga, and video games in a unified
PostgreSQL database.

The defining feature is a **chronological timeline** - every item is sortable by original release date across all
media types, powered by four external APIs normalised into a single schema.

**Live:** [tracker.cuatro.dev](https://tracker.cuatro.dev)

## Stack

| Layer         | Technology                                           |
| ------------- | ---------------------------------------------------- |
| Framework     | Next.js 15 (App Router, standalone output)           |
| UI            | React 19                                             |
| Language      | TypeScript 5.7 (strict, `moduleResolution: bundler`) |
| Styling       | Tailwind CSS v4 (CSS-first, no config file)          |
| Animation     | GSAP 3 + ScrollTrigger                               |
| Database      | PostgreSQL 16 + Prisma 6                             |
| Auth          | NextAuth v4 (email/password credentials)             |
| Client state  | Zustand                                              |
| Server state  | TanStack Query v5                                    |
| Job queue     | BullMQ + Redis                                       |
| Validation    | Zod v4                                               |
| Reverse proxy | Caddy (auto-HTTPS)                                   |

## External APIs

| API           | Covers                          | Auth                      |
| ------------- | ------------------------------- | ------------------------- |
| TMDB          | Movies, TV, streaming providers | API key (free)            |
| AniList       | Anime, manga (GraphQL)          | No key for public queries |
| IGDB          | Games, covers, platforms        | Twitch app token (free)   |
| Steam Web API | Library, achievements, playtime | API key + Steam ID        |

## One-command deploy

```bash
git clone https://github.com/your-username/cuatro-tracker /opt/tracker
cd /opt/tracker/cuatro-tracker
cp .env.example .env
# fill in .env values
docker compose up -d
docker compose exec app pnpm prisma migrate deploy
docker compose exec app pnpm prisma db seed
```

## Development

```bash
  # Prerequisites: Node 22, pnpm 10, Docker
  cd cuatro-tracker
  cp .env.example .env.local

  # fill in DATABASE_URL pointing to local postgres
  docker compose up -d postgres redis
  pnpm install
  pnpm prisma migrate dev
  pnpm prisma db seed
  pnpm dev
```

## Build Phases

| Phase | Description                               | Status  |
| ----- | ----------------------------------------- | ------- |
| 0     | Scaffold, infra, Docker, CI               | Done    |
| 1     | Auth (email/password, session middleware) | Pending |
| 2     | API adapters and normaliser functions     | Pending |
| 3     | Search and add to library                 | Pending |
| 4     | Movies                                    | Pending |
| 5     | TV shows and episodes                     | Pending |
| 6     | Anime and manga                           | Pending |
| 7     | Video games and Steam achievements        | Pending |
| 8     | Chronological timeline                    | Pending |
| 9     | Admin merge tool and bulk import          | Pending |
| 10    | qBittorrent integration                   | Pending |
| 11    | Polish and production hardening           | Pending |
