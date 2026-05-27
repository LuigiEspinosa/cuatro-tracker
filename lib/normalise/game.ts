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
// Three-branch fallback: first_release_date (Unix seconds) -> earliest valid
// release_dates[].y (year-only) -> RELEASE_DATE_SENTINEL. Year-only branch
// uses Math.min across all valid years because IGDB's release_dates array
// mixes per-region / per-platform entries with no documented order; picking
// [0] would silently pick whichever variant lands first. The earliest valid
// year wins so the chronological timeline (Epic 10) sorts by canonical
// release. y must be > 0 because JS Date.UTC(0, ...) maps year 0 -> 1900
// (two-digit-year rule) and IGDB uses y: 0 as an "unknown year" sentinel.
// y <= 275760 because JS Date.UTC overflows beyond that range; a far-future
// IGDB placeholder would otherwise yield an Invalid Date and violate NFR13.
function computeReleaseDate(source: IgdbGame): Date {
  if (
    typeof source.first_release_date === 'number' &&
    Number.isFinite(source.first_release_date) &&
    source.first_release_date !== 0
  ) {
    const candidate = new Date(source.first_release_date * 1000)
    if (!Number.isNaN(candidate.getTime())) return candidate
  }
  const validYears = source.release_dates
    ?.map((r) => r.y)
    .filter(
      (y): y is number =>
        typeof y === 'number' &&
        Number.isFinite(y) &&
        y > 0 &&
        y <= 275760,
    )
  if (validYears && validYears.length > 0) {
    const utc = Date.UTC(Math.min(...validYears), 0, 1)
    if (!Number.isNaN(utc)) return new Date(utc)
  }
  return new Date(RELEASE_DATE_SENTINEL)
}

// Steam reports `0` as the "never played" sentinel and `null` is also
// possible on the wire; both collapse to null so downstream sorting / display
// can rely on the simple null check. The post-construction NaN check guards
// against pathologically large rtime values that would overflow JS Date range
// (mirrors the same guard in computeReleaseDate).
function computeLastPlayed(rtime: number | null | undefined): Date | null {
  if (rtime === null || rtime === undefined) return null
  if (!Number.isFinite(rtime) || rtime <= 0) return null
  const candidate = new Date(rtime * 1000)
  if (Number.isNaN(candidate.getTime())) return null
  return candidate
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

  // IgdbCoverSchema / IgdbScreenshotSchema accept empty-string image_id; the
  // `.trim() || null` and `.filter(...)` guards stop empty AND whitespace-only
  // strings from reaching the DB (which would produce broken CDN URLs at
  // render time via lib/api/igdb-images.ts).
  const base: Prisma.MediaItemCreateInput = {
    type: MediaType.GAME,
    title: source.name,
    release_date: computeReleaseDate(source),
    overview: source.summary ?? null,
    poster_path: source.cover?.image_id?.trim() || null,
    screenshots:
      source.screenshots
        ?.map((s) => s.image_id)
        .filter((id) => id.trim().length > 0) ?? [],
    genres: source.genres?.map((g) => g.name) ?? [],
    platforms: source.platforms?.map((p) => p.name) ?? [],
    developer_name: pickDeveloperName(source.involved_companies),
    publisher_name: pickPublisherName(source.involved_companies),
    igdb_id: source.id,
  }

  if (!steamMeta) return base

  // Negative playtime_forever (rare Steam corruption) would violate the
  // MediaItem_playtime_minutes_check CHECK constraint (>= 0); coerce to null
  // rather than letting Prisma surface a DB constraint violation.
  const ptf = steamMeta.playtime_forever
  const playtime_minutes =
    typeof ptf === 'number' && Number.isFinite(ptf) && ptf >= 0 ? ptf : null

  return {
    ...base,
    steam_app_id: steamMeta.appId,
    playtime_minutes,
    last_played: computeLastPlayed(steamMeta.rtime_last_played),
  }
}
