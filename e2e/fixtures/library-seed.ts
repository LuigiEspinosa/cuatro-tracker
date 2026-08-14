// ! Safety invariant for every function in this file: it owns ONLY rows inside
// ! its two reserved namespaces (MediaItem ids prefixed `e2e-seed-`, and the
// ! closed Steam appid block starting at E2E_STEAM_APPID_BASE) and NEVER
// ! truncates a table or issues a bare deleteMany({}). The appid block is the
// ! one place it removes rows it did not itself insert: the import job writes
// ! those on the fixture's behalf, which is why the block is reserved and
// ! closed rather than open-ended. Running the whole e2e suite against a
// ! developer's populated local database must leave that library byte-identical.
//
// * Failure mode: a fixture that deletes by anything broader than the
// * `e2e-seed-` prefix destroys a developer's real library on the first local
// * run. Prefix scoping is the entire safety model, so widen a `where` clause
// * here only with that consequence in mind.
// * Roads not taken: seeding the library from Playwright's globalSetup (breaks
// * admin-dashboard's `0 PENDING SUGGESTIONS` assertion, which runs first, and
// * timeline's LIBRARY EMPTY assertion, which runs last), and truncating tables
// * between specs (fast, and destroys local data).

import { MediaType, PrismaClient, WatchStatus } from '@prisma/client'

// The single Prisma client the e2e harness is allowed to construct. App code
// uses the `@/lib/db` singleton, but this module runs inside Playwright's
// runner process, which never loads the app's env validation. playwright.config
// already calls loadEnvConfig(process.cwd()), so DATABASE_URL is in process.env
// by the time this module is imported.
export const seedDb = new PrismaClient()

export const E2E_ID_PREFIX = 'e2e-seed-'
export const TIMELINE_ID_PREFIX = `${E2E_ID_PREFIX}tl-`
export const MERGE_ID_PREFIX = `${E2E_ID_PREFIX}merge-`

// Above every real Steam appid, so the cleanup range can never match a game a
// developer actually owns. The block is CLOSED: cleanup matches
// [BASE, BASE + BLOCK), never an open-ended `gte`, because Steam's appid space
// is still growing upward and an unbounded range would eventually swallow a
// real title.
export const E2E_STEAM_APPID_BASE = 9_000_001
export const E2E_STEAM_APPID_BLOCK = 1_000

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']

// Replaces the safety the removed TIMELINE_E2E_SEEDED gate used to provide.
// Every mutating function calls this first, so a DATABASE_URL pointing at a
// remote box cannot be swept by a stray `pnpm test:e2e`.
//
// * Failure mode: the guard is on the HOST, not the database name, because the
// * local dev database and the production database are both named `tracker`;
// * a name pattern would lock out the local run and still admit production.
// * Roads not taken: an allowlist of database names (see above), and a CI-only
// * guard (CI is exactly where the destructive run is expected, so gating on it
// * protects nothing).
function assertLocalDatabase(): void {
  if (process.env.E2E_ALLOW_REMOTE_DB === '1') return

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is required for the e2e seed helper. Set it in .env (local) or the CI env block.',
    )
  }

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error('DATABASE_URL is not a parseable connection string.')
  }

  if (!LOOPBACK_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to seed or sweep a non-loopback database (host: ${host}). The e2e helper deletes rows. Point DATABASE_URL at a local database, or set E2E_ALLOW_REMOTE_DB=1 if you are certain.`,
    )
  }
}

export const TIMELINE_FIRST_YEAR = 1985
export const TIMELINE_LAST_YEAR = 2025
export const ROWS_PER_YEAR = 2

export const E2E_FRANCHISE_ID = `${E2E_ID_PREFIX}franchise`
export const FRANCHISE_SIZE = 30
const FRANCHISE_FIRST_YEAR = 2008
const FRANCHISE_LAST_YEAR = 2025

// Cycled across the base rows so every media-type filter chip has something to
// scope, and every row resolves to a detail route (which is why TV_EPISODE is
// absent: it renders as a non-anchor row and the timeline query excludes it).
const BASE_TYPES = [
  MediaType.MOVIE,
  MediaType.TV_SHOW,
  MediaType.ANIME,
  MediaType.MANGA,
  MediaType.GAME,
]

const WATCH_STATUSES = [
  WatchStatus.PLAN_TO_WATCH,
  WatchStatus.WATCHING,
  WatchStatus.COMPLETED,
  WatchStatus.ON_HOLD,
  WatchStatus.DROPPED,
]

// Coprime with the status count, so all five statuses still appear without
// correlating one-to-one with the five media types.
const STATUS_STRIDE = 3

const COMPLETED_AT_EPOCH_YEAR = 2000

// Day offsets for the consumed dates are permuted, not sequential. A
// completed_at that rises with the row index would rank-correlate perfectly
// with release_date, and the AC-6 consumed-ascending assertion would then pass
// just as happily against a regression that ignored the sort key and fell back
// to release order. Coprime with the span, so the offsets stay distinct.
const COMPLETED_AT_SPAN_DAYS = 83
const COMPLETED_AT_STRIDE = 37

// seedMergePairs derives confidence as 0.99 - index * 0.01, which leaves the
// valid 0..1 band once the count passes this.
const MAX_MERGE_PAIRS = 99

export type TimelineSeedResult = {
  totalRows: number
  franchiseId: string
  franchiseSize: number
}

export type MergePairSeed = {
  sourceId: string
  targetId: string
  suggestionId: string
}

export type SteamExportFixture = {
  buffer: Buffer
  appIds: number[]
}

function pad(value: number): string {
  return String(value).padStart(4, '0')
}

async function deleteByIdPrefix(prefix: string): Promise<void> {
  await seedDb.mergeSuggestion.deleteMany({
    where: { id: { startsWith: prefix } },
  })
  await seedDb.mediaItem.deleteMany({ where: { id: { startsWith: prefix } } })
}

// Writes the deterministic populated library every previously-gated timeline
// assertion was authored against: 1985 to 2025 inclusive at two rows per year,
// all five media types, a mix of consumed and unconsumed entries, plus exactly
// one franchise group of exactly FRANCHISE_SIZE members. Idempotent: it clears
// its own rows before writing, so a Playwright retry re-seeds cleanly.
export async function seedTimelineLibrary(): Promise<TimelineSeedResult> {
  assertLocalDatabase()
  await deleteByIdPrefix(TIMELINE_ID_PREFIX)

  const mediaItems = []
  const entries = []

  const yearCount = TIMELINE_LAST_YEAR - TIMELINE_FIRST_YEAR + 1
  const monthStep = 12 / ROWS_PER_YEAR
  for (let index = 0; index < yearCount * ROWS_PER_YEAR; index++) {
    const year = TIMELINE_FIRST_YEAR + Math.floor(index / ROWS_PER_YEAR)
    // Spread within the year rather than a fixed 6-month step: a raised
    // ROWS_PER_YEAR would otherwise push the month past 11 and roll rows into
    // the following year, silently breaking the declared 1985 to 2025 span.
    const month = Math.floor((index % ROWS_PER_YEAR) * monthStep)
    const id = `${TIMELINE_ID_PREFIX}${pad(index + 1)}`
    mediaItems.push({
      id,
      type: BASE_TYPES[index % BASE_TYPES.length],
      title: `E2E TIMELINE ${pad(index + 1)}`,
      release_date: new Date(Date.UTC(year, month, 14)),
      poster_path: null,
      franchise_id: null,
    })
    entries.push({
      id: `${id}-entry`,
      media_item_id: id,
      status: WATCH_STATUSES[(index * STATUS_STRIDE) % WATCH_STATUSES.length],
      progress: index % 12,
      // Every other row stays unconsumed: the consumed-ascending assertion needs
      // both populations (dash-rendered rows are filtered out of the
      // comparison). The consumed dates are permuted rather than sequential so
      // consumed order is NOT release order, which is what makes the assertion
      // able to fail.
      completed_at:
        index % 2 === 0
          ? new Date(
              Date.UTC(
                COMPLETED_AT_EPOCH_YEAR,
                0,
                1 + ((index * COMPLETED_AT_STRIDE) % COMPLETED_AT_SPAN_DAYS),
              ),
            )
          : null,
    })
  }

  const franchiseSpan = FRANCHISE_LAST_YEAR - FRANCHISE_FIRST_YEAR
  // Guarded divisor: FRANCHISE_SIZE of 1 would divide by zero, and the NaN year
  // becomes an Invalid Date that Prisma rejects for the whole createMany.
  const franchiseDivisor = Math.max(FRANCHISE_SIZE - 1, 1)
  for (let index = 0; index < FRANCHISE_SIZE; index++) {
    const year =
      FRANCHISE_FIRST_YEAR +
      Math.round((index * franchiseSpan) / franchiseDivisor)
    const id = `${TIMELINE_ID_PREFIX}fr-${pad(index + 1)}`
    mediaItems.push({
      id,
      type: MediaType.MOVIE,
      title: `E2E FRANCHISE ${pad(index + 1)}`,
      release_date: new Date(Date.UTC(year, (index % 2) * 6, 12)),
      poster_path: null,
      franchise_id: E2E_FRANCHISE_ID,
    })
    entries.push({
      id: `${id}-entry`,
      media_item_id: id,
      status: WATCH_STATUSES[index % WATCH_STATUSES.length],
      progress: 0,
      completed_at: null,
    })
  }

  // One transaction: a failure between the two writes would otherwise leave
  // entry-less MediaItems, which findTimelineEntries cannot see, so the specs
  // would fail against a library that looks empty while 112 rows sit in the
  // table.
  await seedDb.$transaction([
    seedDb.mediaItem.createMany({ data: mediaItems }),
    seedDb.userEntry.createMany({ data: entries }),
  ])

  return {
    totalRows: mediaItems.length,
    franchiseId: E2E_FRANCHISE_ID,
    franchiseSize: FRANCHISE_SIZE,
  }
}

// Source/target pairs with a pending MergeSuggestion each, confidence
// descending so the review queue order is deterministic. Both sides carry a
// UserEntry, so the accept path exercises the conflict merge and the caller can
// assert the target entry survived.
export async function seedMergePairs(count: number): Promise<MergePairSeed[]> {
  if (count < 1 || count > MAX_MERGE_PAIRS) {
    throw new Error(
      `seedMergePairs: count must be between 1 and ${MAX_MERGE_PAIRS}; confidence leaves the valid 0..1 band beyond that.`,
    )
  }
  assertLocalDatabase()
  await deleteByIdPrefix(MERGE_ID_PREFIX)

  const pairs: MergePairSeed[] = []
  for (let index = 0; index < count; index++) {
    const sourceId = `${MERGE_ID_PREFIX}src-${pad(index + 1)}`
    const targetId = `${MERGE_ID_PREFIX}tgt-${pad(index + 1)}`
    const suggestionId = `${MERGE_ID_PREFIX}sug-${pad(index + 1)}`

    await seedDb.mediaItem.create({
      data: {
        id: sourceId,
        type: MediaType.MOVIE,
        title: `E2E MERGE DUP ${pad(index + 1)}`,
        release_date: new Date(Date.UTC(2001, 0, 1)),
        user_entry: {
          create: {
            id: `${sourceId}-entry`,
            status: WatchStatus.WATCHING,
            progress: 3,
          },
        },
      },
    })
    await seedDb.mediaItem.create({
      data: {
        id: targetId,
        type: MediaType.MOVIE,
        title: `E2E MERGE CANON ${pad(index + 1)}`,
        release_date: new Date(Date.UTC(2001, 0, 1)),
        user_entry: {
          create: {
            id: `${targetId}-entry`,
            status: WatchStatus.COMPLETED,
            progress: 9,
          },
        },
      },
    })
    await seedDb.mergeSuggestion.create({
      data: {
        id: suggestionId,
        source_id: sourceId,
        target_id: targetId,
        confidence: 0.99 - index * 0.01,
      },
    })

    pairs.push({ sourceId, targetId, suggestionId })
  }
  return pairs
}

// Pure: builds an in-memory GetOwnedGames payload for the import wizard and
// touches no database. Every appid sits in the reserved e2e block so the rows
// the import job writes are still cleanupSeeded-owned, and the names are
// prefixed so a stray survivor is greppable.
export function steamExportFixture(count: number): SteamExportFixture {
  if (count < 1 || count > E2E_STEAM_APPID_BLOCK) {
    throw new Error(
      `steamExportFixture: count must be between 1 and ${E2E_STEAM_APPID_BLOCK}, the size of the reserved appid block cleanupSeeded sweeps.`,
    )
  }
  const appIds = Array.from(
    { length: count },
    (_, index) => E2E_STEAM_APPID_BASE + index,
  )
  const games = appIds.map((appid, index) => ({
    appid,
    name: `E2E STEAM ${pad(index + 1)}`,
    playtime_forever: (index + 1) * 10,
    rtime_last_played: 0,
  }))
  return {
    buffer: Buffer.from(JSON.stringify({ response: { games } }), 'utf-8'),
    appIds,
  }
}

// Removes every row this module can create, in either direction: prefixed ids
// and the closed Steam appid block (which covers rows the import job wrote on
// the fixture's behalf, the one case where the helper removes a row it did not
// itself insert). UserEntry, MergeSuggestion and Achievement all cascade from
// MediaItem, so the single mediaItem delete is sufficient; the mergeSuggestion
// delete is belt and braces for a prefixed suggestion whose media rows were
// already gone.
export async function cleanupSeeded(): Promise<void> {
  assertLocalDatabase()
  await seedDb.mergeSuggestion.deleteMany({
    where: { id: { startsWith: E2E_ID_PREFIX } },
  })
  await seedDb.mediaItem.deleteMany({
    where: {
      OR: [
        { id: { startsWith: E2E_ID_PREFIX } },
        {
          steam_app_id: {
            gte: E2E_STEAM_APPID_BASE,
            lt: E2E_STEAM_APPID_BASE + E2E_STEAM_APPID_BLOCK,
          },
        },
      ],
    },
  })
}

export async function disconnectSeed(): Promise<void> {
  await seedDb.$disconnect()
}
