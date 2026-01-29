# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-01-29

### Added

- TV discovery and detail pages (`/tv` and `/tv/[id]`) so TV series can be browsed separately from movies while preserving the existing movie homepage.
- TMDB TV helpers for popular/trending/first‑air sorting and TV/season detail fetches to power the TV pages.
- Rich TV series metadata and full season/episode listing with episode metadata to surface as much TMDB data as possible on the detail page.
- Per‑episode tracking (watchlist/watching/completed/dropped) including:
  - Prisma models to persist episodes and user episode status.
  - An API route to create/update/remove episode tracking.
  - UI buttons on each episode to set/remove status.

### Changed

- Navigation now includes a TV link for quicker access.
- TV details page now queries per‑episode tracking status for the signed‑in user when available.

### Fixed

- Guarded the episode‑tracking query on TV details to avoid runtime errors before the Prisma client is regenerated after schema changes.

### Files Touched (with reason)

- `lib/tmdb.ts` — added TV and season helpers plus richer append fields for metadata/episodes.
- `components/TvCard.tsx` — created TV card UI for the TV list page.
- `app/tv/page.tsx` — added TV listing with sorting/pagination.
- `app/tv/[id]/page.tsx` — added rich series metadata, season/episode details, and per‑episode tracking UI.
- `app/layout.tsx` — added a TV nav link.
- `prisma/schema.prisma` — added `Episode` and `UserEpisode` models for episode tracking.
- `lib/episodes.ts` — added episode caching/upsert helper.
- `app/api/track-episode/route.ts` — added episode tracking API endpoints.
- `components/EpisodeTrackButtons.tsx` — added per‑episode tracking buttons wired to the API.
- `CHANGELOG.md` — documented changes and rationale.

### Code Changes (what + why)

#### TMDB TV helpers

TV pages need their own TMDB endpoints and richer metadata for details and seasons.

```ts
// lib/tmdb.ts
export async function getTvDetails(id: number) {
	return tmdb(
		`/tv/${id}?append_to_response=credits,aggregate_credits,content_ratings,external_ids,keywords,images,videos,recommendations,similar`,
	);
}

export async function getTvSeasonDetails(id: number, seasonNumber: number) {
	return tmdb(
		`/tv/${id}/season/${seasonNumber}?append_to_response=credits,external_ids,images,videos`,
	);
}
```

#### TV list page

Provide a TV landing page that mirrors the movie experience (sorting + paging).

```tsx
// app/tv/page.tsx
const data =
	sort === "trending"
		? await getTrendingTv("day", page)
		: sort === "release"
			? await getByFirstAirDate(page, dir)
			: await getPopularTv(page, dir);
```

#### TV details metadata + episodes

Show rich series metadata and a full season/episode list on the detail page.

```tsx
// app/tv/[id]/page.tsx
const seasonDetails = await Promise.all(
	seasonsWithNumber.map(async (s: any) => ({
		season: s,
		details: await getTvSeasonDetails(tmdbId, s.season_number),
	})),
);
```

#### Episode tracking UI

Allow users to set watch status per episode from the TV details page.

```tsx
// components/EpisodeTrackButtons.tsx
const res = await fetch("/api/track-episode", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ tvId, episode: episodePayload, status: next }),
});
```

#### Episode tracking API

Persist episode tracking status server-side.

```ts
// app/api/track-episode/route.ts
const rec = await prisma.userEpisode.upsert({
	where: { userId_tmdbEpisodeId: { userId, tmdbEpisodeId: body.episode.id } },
	update: { status: body.status },
	create: { userId, tmdbEpisodeId: body.episode.id, status: body.status },
	include: { episode: true },
});
```

#### Prisma episode models

Store episode metadata and per-user status in the database.

```prisma
// prisma/schema.prisma
model Episode {
  tmdbId        Int      @id
  tvId          Int
  seasonNumber  Int
  episodeNumber Int
  name          String
  userEpisodes  UserEpisode[]
}

model UserEpisode {
  id            String      @id @default(cuid())
  userId        String
  tmdbEpisodeId Int
  status        TrackStatus
  episode       Episode @relation(fields: [tmdbEpisodeId], references: [tmdbId], onDelete: Cascade)
  @@unique([userId, tmdbEpisodeId], name: "userId_tmdbEpisodeId")
}
```

#### TV nav link

Make the new TV area discoverable from the main nav.

```tsx
// app/layout.tsx
<Link href="/tv" className="hover:underline">
	TV
</Link>
```
