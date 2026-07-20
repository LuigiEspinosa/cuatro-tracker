import { z } from 'zod'
import { XMLParser } from 'fast-xml-parser'
import { SteamOwnedGameSchema } from '@/lib/api/steam'

// The three import formats the /admin/import wizard accepts. Shared by the
// upload route (format enum validation), the wizard radios, and the job.
export const IMPORT_FORMATS = ['TRAKT_JSON', 'MAL_XML', 'STEAM_EXPORT'] as const
export type ImportFormat = (typeof IMPORT_FORMATS)[number]
export const ImportFormatSchema = z.enum(IMPORT_FORMATS)

// A parse-level failure (bad JSON / XML root, wrong shape). Thrown as a real
// Error so the bulkImport job surfaces it as a job failure -> SSE `error`
// frame. Field-level tampering surfaces separately as a ZodError with a path.
export class ImportParseError extends Error {
  readonly format: ImportFormat

  constructor(format: ImportFormat, message: string) {
    super(message)
    this.name = 'ImportParseError'
    this.format = format
  }
}

// Each row carries its `format` as a discriminant so the pure mapping helpers
// in map-row.ts narrow without a cast and the job iterates a typed union.

export type TraktRow = {
  format: 'TRAKT_JSON'
  tmdbId: number
  mediaType: 'movie' | 'show'
  title: string | null
  // Whether the export row represents watched history (vs a watchlist entry).
  watched: boolean
  rating: number | null
}

export type MalRow = {
  format: 'MAL_XML'
  malId: number
  mediaType: 'anime' | 'manga'
  title: string | null
  // Raw MAL `my_status` string (or numeric code); mapped in toUserEntry.
  status: string
  progress: number
  // MAL `my_score`; 0 means unset.
  score: number
}

export type SteamRow = {
  format: 'STEAM_EXPORT'
  appid: number
  name: string
  playtimeForever: number
  rtimeLastPlayed: number | null
}

export type ImportRow = TraktRow | MalRow | SteamRow

// ---- Trakt JSON ----

const TraktIdsSchema = z.object({
  tmdb: z.number().int().positive().nullable().optional(),
})

const TraktMediaSchema = z.object({
  title: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  ids: TraktIdsSchema.optional(),
})

// Covers the /sync/history, /sync/watched, /sync/watchlist and /sync/ratings
// export shapes: a `movie` or `show` object plus optional watched / listed /
// rated signals. Episode rows still carry a `show`, so they map at show level.
const TraktEntrySchema = z.object({
  type: z.string().optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  watched_at: z.string().nullable().optional(),
  last_watched_at: z.string().nullable().optional(),
  listed_at: z.string().nullable().optional(),
  rated_at: z.string().nullable().optional(),
  plays: z.number().int().nullable().optional(),
  movie: TraktMediaSchema.optional(),
  show: TraktMediaSchema.optional(),
})

function toTraktEntryArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    // Some exports wrap the rows in a top-level object (e.g.
    // { movies: [...], shows: [...] }); flatten every array-valued property.
    const arrays = Object.values(parsed as Record<string, unknown>).filter(
      Array.isArray,
    ) as unknown[][]
    if (arrays.length > 0) return arrays.flat()
  }
  throw new ImportParseError(
    'TRAKT_JSON',
    'expected a JSON array of Trakt items',
  )
}

export function parseTraktJson(text: string): TraktRow[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ImportParseError('TRAKT_JSON', 'file is not valid JSON')
  }

  const rows: TraktRow[] = []
  // Per-row resilience: a single malformed record is skipped, not fatal. A
  // wrong top-level shape still throws (toTraktEntryArray -> ImportParseError).
  for (const raw of toTraktEntryArray(parsed)) {
    const result = TraktEntrySchema.safeParse(raw)
    if (!result.success) continue
    const entry = result.data
    const media = entry.movie ?? entry.show
    const tmdbId = media?.ids?.tmdb
    if (!media || tmdbId === null || tmdbId === undefined) continue
    rows.push({
      format: 'TRAKT_JSON',
      tmdbId,
      mediaType: entry.movie ? 'movie' : 'show',
      title: media.title ?? null,
      watched:
        Boolean(entry.watched_at) ||
        Boolean(entry.last_watched_at) ||
        (entry.plays ?? 0) > 0,
      rating: entry.rating ?? null,
    })
  }
  return rows
}

// ---- MyAnimeList XML ----

const MalAnimeSchema = z.object({
  series_animedb_id: z.coerce.number().int().positive(),
  series_title: z.coerce.string().optional(),
  my_watched_episodes: z.coerce.number().int().min(0).default(0),
  my_score: z.coerce.number().int().min(0).max(10).default(0),
  my_status: z.coerce.string().default('Plan to Watch'),
})

const MalMangaSchema = z.object({
  manga_mangadb_id: z.coerce.number().int().positive(),
  manga_title: z.coerce.string().optional(),
  my_read_chapters: z.coerce.number().int().min(0).default(0),
  my_score: z.coerce.number().int().min(0).max(10).default(0),
  my_status: z.coerce.string().default('Plan to Read'),
})

// Root-shape validation only (a missing <myanimelist> throws a clean
// ImportParseError); individual <anime> / <manga> records are validated
// per-element in parseMalXml so one malformed entry is skipped, not fatal.
const MalRootSchema = z.object({
  myanimelist: z.object({
    anime: z.array(z.unknown()).default([]),
    manga: z.array(z.unknown()).default([]),
  }),
})

// `isArray` forces `<anime>` / `<manga>` to arrays even when the export has a
// single record, so the schema always sees `MalAnime[]` / `MalManga[]`.
const malXmlParser = new XMLParser({
  isArray: (name) => name === 'anime' || name === 'manga',
})

export function parseMalXml(text: string): MalRow[] {
  let doc: unknown
  try {
    doc = malXmlParser.parse(text)
  } catch {
    throw new ImportParseError('MAL_XML', 'file is not valid XML')
  }

  const root = MalRootSchema.safeParse(doc)
  if (!root.success) {
    throw new ImportParseError('MAL_XML', 'missing <myanimelist> root element')
  }
  const rows: MalRow[] = []

  for (const raw of root.data.myanimelist.anime) {
    const result = MalAnimeSchema.safeParse(raw)
    if (!result.success) continue
    const anime = result.data
    rows.push({
      format: 'MAL_XML',
      malId: anime.series_animedb_id,
      mediaType: 'anime',
      title: anime.series_title ?? null,
      status: anime.my_status,
      progress: anime.my_watched_episodes,
      score: anime.my_score,
    })
  }
  for (const raw of root.data.myanimelist.manga) {
    const result = MalMangaSchema.safeParse(raw)
    if (!result.success) continue
    const manga = result.data
    rows.push({
      format: 'MAL_XML',
      malId: manga.manga_mangadb_id,
      mediaType: 'manga',
      title: manga.manga_title ?? null,
      status: manga.my_status,
      progress: manga.my_read_chapters,
      score: manga.my_score,
    })
  }
  return rows
}

// ---- Steam library export (GetOwnedGames JSON) ----

// Root-shape validation only; each game is validated per-element in
// parseSteamExport so one malformed entry is skipped, not fatal.
const SteamRootSchema = z.object({
  response: z
    .object({
      games: z.array(z.unknown()).default([]),
    })
    .default({ games: [] }),
})

export function parseSteamExport(text: string): SteamRow[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ImportParseError('STEAM_EXPORT', 'file is not valid JSON')
  }

  const root = SteamRootSchema.safeParse(parsed)
  if (!root.success) {
    throw new ImportParseError('STEAM_EXPORT', 'missing response.games array')
  }
  const rows: SteamRow[] = []
  for (const raw of root.data.response.games) {
    const result = SteamOwnedGameSchema.safeParse(raw)
    if (!result.success) continue
    const game = result.data
    rows.push({
      format: 'STEAM_EXPORT',
      appid: game.appid,
      name: game.name,
      playtimeForever: game.playtime_forever,
      rtimeLastPlayed: game.rtime_last_played ?? null,
    })
  }
  return rows
}

// Dispatch by format string to the matching parser. Keeps the job's parse step
// a single call and the format-to-parser wiring in one place.
export function parseImport(format: ImportFormat, text: string): ImportRow[] {
  switch (format) {
    case 'TRAKT_JSON':
      return parseTraktJson(text)
    case 'MAL_XML':
      return parseMalXml(text)
    case 'STEAM_EXPORT':
      return parseSteamExport(text)
  }
}
