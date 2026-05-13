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
  const userEntry: UserEntry = await db.userEntry.create({
    data: { media_item_id: mediaItem.id, ...NEW_USER_ENTRY },
  })
  return {
    mediaItem: { ...mediaItem, user_entry: userEntry },
    created: true,
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

  let normalised: Prisma.MediaItemCreateInput
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

  try {
    const releaseYear = normalised.release_date instanceof Date
      ? normalised.release_date.getUTCFullYear()
      : new Date(normalised.release_date as string).getUTCFullYear()
    const normalisedKey = normaliseTitle(normalised.title)
    const candidates = await findCrossSourceCandidates(source, releaseYear)
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
      return jsonResponse(
        { error: 'constraint_violation', code: err.code, message: err.message },
        400,
      )
    }
    throw err
  }
}

export const POST = withRequest<NextRequest, NextResponse>(handler)
