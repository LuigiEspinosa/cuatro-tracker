import { NextResponse, type NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { MediaType, Prisma, WatchStatus, type UserEntry } from '@prisma/client'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'
import { TmdbApiError } from '@/lib/api/tmdb'
import {
  getDispatcher,
  type AddMediaSource,
  type NormalisedShowWithEpisodes,
} from '@/lib/search/media-dispatcher'
import { normaliseTitle } from '@/lib/search/federation'

export const dynamic = 'force-dynamic'

const AddMediaBodySchema = z.object({
  source: z.enum(['tmdb', 'anilist', 'igdb', 'steam']),
  sourceId: z.coerce.number().int().positive(),
  type: z.nativeEnum(MediaType),
})

type MediaItemWithUserEntry = Prisma.MediaItemGetPayload<{
  include: { user_entry: true }
}>

const NEW_USER_ENTRY = {
  status: WatchStatus.PLAN_TO_WATCH,
  progress: 0,
} as const

function findExistingBySourceId(
  source: AddMediaSource,
  sourceId: number,
): Promise<MediaItemWithUserEntry | null> {
  const include = { user_entry: true } as const
  switch (source) {
    case 'tmdb':
      return db.mediaItem.findUnique({ where: { tmdb_id: sourceId }, include })
    case 'anilist':
      return db.mediaItem.findUnique({
        where: { anilist_id: sourceId },
        include,
      })
    case 'igdb':
      return db.mediaItem.findUnique({ where: { igdb_id: sourceId }, include })
    case 'steam':
      return db.mediaItem.findUnique({
        where: { steam_id: sourceId },
        include,
      })
  }
}

function findCrossSourceCandidates(
  source: AddMediaSource,
  releaseYear: number,
): Promise<MediaItemWithUserEntry[]> {
  const include = { user_entry: true } as const
  const yearStart = new Date(Date.UTC(releaseYear, 0, 1))
  const yearEnd = new Date(Date.UTC(releaseYear + 1, 0, 1))
  const release_date = { gte: yearStart, lt: yearEnd }
  switch (source) {
    case 'tmdb':
      return db.mediaItem.findMany({
        where: { tmdb_id: null, release_date },
        include,
        take: 50,
      })
    case 'anilist':
      return db.mediaItem.findMany({
        where: { anilist_id: null, release_date },
        include,
        take: 50,
      })
    case 'igdb':
      return db.mediaItem.findMany({
        where: { igdb_id: null, release_date },
        include,
        take: 50,
      })
    case 'steam':
      return db.mediaItem.findMany({
        where: { steam_id: null, release_date },
        include,
        take: 50,
      })
  }
}

function patchSourceId(
  id: string,
  source: AddMediaSource,
  sourceId: number,
): Promise<MediaItemWithUserEntry> {
  const include = { user_entry: true } as const
  const data: Prisma.MediaItemUpdateInput =
    source === 'tmdb'
      ? { tmdb_id: sourceId }
      : source === 'anilist'
        ? { anilist_id: sourceId }
        : source === 'igdb'
          ? { igdb_id: sourceId }
          : { steam_id: sourceId }
  return db.mediaItem.update({ where: { id }, data, include })
}

async function ensureUserEntry(
  mediaItem: MediaItemWithUserEntry,
): Promise<{ mediaItem: MediaItemWithUserEntry; created: boolean }> {
  if (mediaItem.user_entry) return { mediaItem, created: false }
  try {
    const userEntry: UserEntry = await db.userEntry.create({
      data: { media_item_id: mediaItem.id, ...NEW_USER_ENTRY },
    })
    return {
      mediaItem: { ...mediaItem, user_entry: userEntry },
      created: true,
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // Concurrent POST won the race on UserEntry.media_item_id @unique.
      // Re-fetch the row + its entry and treat the response as idempotent.
      const refetched = await db.mediaItem.findUnique({
        where: { id: mediaItem.id },
        include: { user_entry: true },
      })
      if (refetched?.user_entry) {
        return { mediaItem: refetched, created: false }
      }
    }
    throw err
  }
}

function jsonResponse(
  body: unknown,
  status: number,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function handler(req: NextRequest): Promise<NextResponse> {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    logger.warn(
      { event: 'media.bad_request', reason: 'invalid_json' },
      'media body was not valid JSON',
    )
    return jsonResponse({ error: 'invalid_body', reason: 'invalid_json' }, 400)
  }

  const parsed = AddMediaBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    logger.warn(
      { event: 'media.bad_request', issues: parsed.error.issues },
      'media body validation failed',
    )
    return jsonResponse(
      { error: 'invalid_body', issues: parsed.error.issues },
      400,
    )
  }

  const { source, sourceId, type } = parsed.data

  const dispatcher = getDispatcher(source, type)
  if (!dispatcher) {
    logger.warn(
      { event: 'media.unsupported_source_type', source, type },
      'no adapter wired for this (source, type) tuple',
    )
    return jsonResponse(
      { error: 'unsupported_source_type', source, type },
      501,
    )
  }

  // Idempotent fast-path: if a MediaItem already has this exact source ID,
  // skip the adapter fetch entirely. Saves a TMDB round-trip on retries.
  const existingBySource = await findExistingBySourceId(source, sourceId)
  if (existingBySource) {
    const ensured = await ensureUserEntry(existingBySource)
    return jsonResponse(
      { mediaItem: ensured.mediaItem, merged: false },
      ensured.created ? 201 : 200,
    )
  }

  let raw: unknown
  try {
    raw = await dispatcher.fetch(sourceId)
  } catch (err) {
    if (err instanceof TmdbApiError) {
      logger.warn(
        {
          event: 'media.upstream_failed',
          source,
          sourceId,
          endpoint: err.endpoint,
          httpStatus: err.httpStatus,
          err,
        },
        'upstream adapter rejected',
      )
      return jsonResponse(
        { error: 'upstream_failed', source, sourceId },
        502,
      )
    }
    throw err
  }

  let normalised:
    | Prisma.MediaItemCreateInput
    | NormalisedShowWithEpisodes
  try {
    normalised = dispatcher.normalise(raw)
  } catch (err) {
    if (err instanceof ZodError) {
      logger.warn(
        {
          event: 'media.normalise_failed',
          source,
          sourceId,
          issues: err.issues,
        },
        'normaliser rejected upstream payload',
      )
      return jsonResponse(
        { error: 'normalise_failed', issues: err.issues },
        422,
      )
    }
    throw err
  }

  if ('episodes' in normalised) {
    return persistShowWithEpisodes(normalised, source, sourceId, type)
  }

  return persistSingleMediaItem(normalised, source, sourceId, type)
}

async function persistSingleMediaItem(
  normalised: Prisma.MediaItemCreateInput,
  source: AddMediaSource,
  sourceId: number,
  type: MediaType,
): Promise<NextResponse> {
  try {
    const releaseYear = normalised.release_date instanceof Date
      ? normalised.release_date.getUTCFullYear()
      : new Date(normalised.release_date as string).getUTCFullYear()
    const normalisedKey = normaliseTitle(normalised.title)
    // Skip cross-merge when the normaliser fell back to the 1970 sentinel —
    // every undated item shares that year bucket and would falsely collide.
    const candidates =
      releaseYear === 1970
        ? []
        : await findCrossSourceCandidates(source, releaseYear)
    const crossMatch = candidates.find(
      (c) => normaliseTitle(c.title) === normalisedKey,
    )

    if (crossMatch) {
      const patched = await patchSourceId(crossMatch.id, source, sourceId)
      const ensured = await ensureUserEntry(patched)
      return jsonResponse(
        { mediaItem: ensured.mediaItem, merged: true },
        ensured.created ? 201 : 200,
      )
    }

    const created: MediaItemWithUserEntry = await db.mediaItem.create({
      data: {
        ...normalised,
        user_entry: { create: NEW_USER_ENTRY },
      },
      include: { user_entry: true },
    })
    return jsonResponse({ mediaItem: created, merged: false }, 201)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const racedExisting = await findExistingBySourceId(source, sourceId)
        if (racedExisting) {
          const ensured = await ensureUserEntry(racedExisting)
          return jsonResponse(
            { mediaItem: ensured.mediaItem, merged: false },
            200,
          )
        }
      }
      return logAndReturnConstraintViolation(err, source, sourceId, type)
    }
    throw err
  }
}

async function persistShowWithEpisodes(
  normalised: NormalisedShowWithEpisodes,
  source: AddMediaSource,
  sourceId: number,
  type: MediaType,
): Promise<NextResponse> {
  try {
    const releaseYear = normalised.show.release_date instanceof Date
      ? normalised.show.release_date.getUTCFullYear()
      : new Date(normalised.show.release_date as string).getUTCFullYear()
    const normalisedKey = normaliseTitle(normalised.show.title)
    // Skip cross-merge when the normaliser fell back to the 1970 sentinel —
    // every undated item shares that year bucket and would falsely collide.
    const candidates =
      releaseYear === 1970
        ? []
        : await findCrossSourceCandidates(source, releaseYear)
    // Filter to TV_SHOW only: a 1984 movie and a 1984 TV show with the same
    // normalised title (e.g. "Dune") must not collapse.
    const crossMatch = candidates.find(
      (c) =>
        c.type === MediaType.TV_SHOW &&
        normaliseTitle(c.title) === normalisedKey,
    )

    if (crossMatch) {
      // Patch the source ID onto the existing show row; the inbound episodes
      // are DISCARDED — the cross-source sibling's episodes from the original
      // adapter remain authoritative (per OI #6 in the impl-artifact).
      const patched = await patchSourceId(crossMatch.id, source, sourceId)
      const ensured = await ensureUserEntry(patched)
      return jsonResponse(
        { mediaItem: ensured.mediaItem, merged: true },
        ensured.created ? 201 : 200,
      )
    }

    const created: MediaItemWithUserEntry = await db.$transaction(
      async (tx) => {
        const showRow = await tx.mediaItem.create({
          data: {
            ...normalised.show,
            user_entry: { create: NEW_USER_ENTRY },
          },
          include: { user_entry: true },
        })
        if (normalised.episodes.length > 0) {
          await tx.mediaItem.createMany({
            data: normalised.episodes.map((e) => ({
              ...(e as Prisma.MediaItemCreateManyInput),
              parent_id: showRow.id,
            })),
          })
        }
        return showRow
      },
      { timeout: 30_000 },
    )
    return jsonResponse({ mediaItem: created, merged: false }, 201)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        // Show-level race: a concurrent POST inserted the same `sourceId`
        // between the fast-path check and the transaction's show create.
        const racedExisting = await findExistingBySourceId(source, sourceId)
        if (racedExisting) {
          const ensured = await ensureUserEntry(racedExisting)
          return jsonResponse(
            { mediaItem: ensured.mediaItem, merged: false },
            200,
          )
        }
        // Episode tmdb_id collided with a foreign MediaItem row. Atomic
        // transactions can't leave orphan episodes, so the "same-parent
        // re-import" case is unreachable here — this is a real cross-context
        // collision worth surfacing for operator investigation. The schema
        // fix is the @@unique([type, tmdb_id]) follow-up migration (ECH-4).
        logger.error(
          {
            event: 'media.tmdb_id_collision',
            source,
            sourceId,
            type,
            err,
          },
          'episode tmdb_id collided with existing MediaItem of a different context',
        )
        return jsonResponse(
          { error: 'cross_type_tmdb_id_collision', code: 'P2002' },
          500,
        )
      }
      return logAndReturnConstraintViolation(err, source, sourceId, type)
    }
    throw err
  }
}

function logAndReturnConstraintViolation(
  err: Prisma.PrismaClientKnownRequestError,
  source: AddMediaSource,
  sourceId: number,
  type: MediaType,
): NextResponse {
  logger.warn(
    {
      event: 'media.constraint_violation',
      source,
      sourceId,
      type,
      code: err.code,
      err,
    },
    'database constraint violation',
  )
  // Omit err.message in the response to avoid leaking schema column names.
  return jsonResponse(
    { error: 'constraint_violation', code: err.code },
    400,
  )
}

export const POST = withRequest<NextRequest, NextResponse>(handler)
