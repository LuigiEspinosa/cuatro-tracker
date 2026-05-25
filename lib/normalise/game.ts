import { Prisma, MediaType } from '@prisma/client'
import { IgdbGameSchema, type IgdbGame } from '@/lib/api/igdb'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'

// Raw Steam shape from `lib/api/steam.ts` getOwnedGames; the normaliser owns
// the Unix-seconds -> Date conversion so callers can pass the upstream
// payload through verbatim without pre-processing. Slight deviation from the
// epics.md BDD (`last_played: Date`); decision Q-Style locked at story-author
// time keeps the boundary in one place.
export type SteamMeta = {
  appId: number
  playtime_forever?: number
  rtime_last_played?: number | null
}

// Returns the first involved_company flagged developer === true; null
// otherwise. Mirrors `pickAnimationStudio` in lib/normalise/anime.ts.
function pickDeveloperName(
  involvedCompanies?: IgdbGame['involved_companies'],
): string | null {
  if (!involvedCompanies) return null
  const dev = involvedCompanies.find((c) => c.developer === true)
  return dev?.company.name ?? null
}

function pickPublisherName(
  involvedCompanies?: IgdbGame['involved_companies'],
): string | null {
  if (!involvedCompanies) return null
  const pub = involvedCompanies.find((c) => c.publisher === true)
  return pub?.company.name ?? null
}

// NFR13 invariant: release_date must always be a valid Date, never null/NaN.
// Three-branch fallback: first_release_date (Unix seconds) -> release_dates[0].y
// (year-only) -> RELEASE_DATE_SENTINEL. Year-only branch anchors via
// Date.UTC(year, 0, 1) to mirror lib/api/anilist.ts partialDateToDate and stay
// TZ-independent.
function computeReleaseDate(source: IgdbGame): Date {
  if (
    typeof source.first_release_date === 'number' &&
    Number.isFinite(source.first_release_date) &&
    source.first_release_date !== 0
  ) {
    const candidate = new Date(source.first_release_date * 1000)
    if (!Number.isNaN(candidate.getTime())) return candidate
  }
  const yearOnly = source.release_dates?.[0]?.y
  if (typeof yearOnly === 'number' && Number.isFinite(yearOnly)) {
    return new Date(Date.UTC(yearOnly, 0, 1))
  }
  return new Date(RELEASE_DATE_SENTINEL)
}

// Steam reports `0` as the "never played" sentinel and `null` is also
// possible on the wire; both collapse to null so downstream sorting / display
// can rely on the simple null check.
function computeLastPlayed(rtime: number | null | undefined): Date | null {
  if (rtime === null || rtime === undefined) return null
  if (!Number.isFinite(rtime) || rtime <= 0) return null
  return new Date(rtime * 1000)
}

// * Defensive Zod re-parse at the normaliser boundary even though `lib/api/igdb.ts`
// * already validated. Mirrors lib/normalise/movie.ts + lib/normalise/anime.ts:
// * a future caller building a MediaItem from a cached / persisted shape must
// * still flow through the schema to keep the create-input contract honest.
export function normaliseIgdbGame(
  raw: unknown,
  steamMeta?: SteamMeta,
): Prisma.MediaItemCreateInput {
  const source = IgdbGameSchema.parse(raw)

  const base: Prisma.MediaItemCreateInput = {
    type: MediaType.GAME,
    title: source.name,
    release_date: computeReleaseDate(source),
    overview: source.summary ?? null,
    poster_path: source.cover?.image_id ?? null,
    screenshots: source.screenshots?.map((s) => s.image_id) ?? [],
    genres: source.genres?.map((g) => g.name) ?? [],
    platforms: source.platforms?.map((p) => p.name) ?? [],
    developer_name: pickDeveloperName(source.involved_companies),
    publisher_name: pickPublisherName(source.involved_companies),
    igdb_id: source.id,
  }

  if (!steamMeta) return base

  return {
    ...base,
    steam_app_id: steamMeta.appId,
    playtime_minutes: steamMeta.playtime_forever ?? null,
    last_played: computeLastPlayed(steamMeta.rtime_last_played),
  }
}
