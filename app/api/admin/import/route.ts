import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'
import { redis } from '@/lib/redis'
import { queues } from '@/lib/jobs/queues'
import {
  BULK_IMPORT_QUEUE,
  BULK_IMPORT_FILE_PREFIX,
} from '@/lib/jobs/bulkImport'
import { ImportFormatSchema } from '@/lib/import/formats'
import { MAX_IMPORT_BYTES } from '@/lib/import/constants'

export const dynamic = 'force-dynamic'

// The raw file lives in Redis only until the job consumes it (the processor
// deletes the key). The TTL is a backstop so an enqueue that never runs does
// not leak the bytes forever.
const FILE_TTL_SECONDS = 3600

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/* `POST /api/admin/import` (Story 11.5 AC-2 / AC-7): accept a multipart upload,
 * cap + validate it, persist the bytes to Redis, and enqueue a bulkImport job.
 * Gated by the auth middleware (the matcher does not exclude /api/admin), so an
 * unauthenticated caller is redirected to /login before reaching this handler.
 */
async function handler(req: NextRequest): Promise<NextResponse> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    logger.warn(
      { event: 'admin.import.bad_request', reason: 'expected_multipart' },
      'import body was not multipart/form-data',
    )
    return jsonResponse(
      { error: 'invalid_body', reason: 'expected_multipart' },
      400,
    )
  }

  const format = ImportFormatSchema.safeParse(form.get('format'))
  if (!format.success) {
    logger.warn(
      { event: 'admin.import.bad_request', reason: 'bad_format' },
      'import format missing or unrecognised',
    )
    return jsonResponse({ error: 'invalid_body', reason: 'bad_format' }, 400)
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    logger.warn(
      { event: 'admin.import.bad_request', reason: 'empty_file' },
      'import file missing or empty',
    )
    return jsonResponse({ error: 'invalid_body', reason: 'empty_file' }, 400)
  }

  if (file.size > MAX_IMPORT_BYTES) {
    logger.warn(
      {
        event: 'admin.import.too_large',
        size: file.size,
        maxBytes: MAX_IMPORT_BYTES,
      },
      'import file exceeds the size cap',
    )
    return jsonResponse(
      { error: 'file_too_large', maxBytes: MAX_IMPORT_BYTES },
      413,
    )
  }

  const jobId = randomUUID()
  const redisKey = `${BULK_IMPORT_FILE_PREFIX}${jobId}`
  const bytes = Buffer.from(await file.arrayBuffer())
  await redis.set(redisKey, bytes, 'EX', FILE_TTL_SECONDS)

  const entry = queues.find((q) => q.name === BULK_IMPORT_QUEUE)
  if (!entry) {
    logger.error(
      { event: 'admin.import.queue_unavailable', jobId },
      'bulkImport queue is not registered',
    )
    await redis.del(redisKey)
    return jsonResponse({ error: 'queue_unavailable' }, 500)
  }

  await entry.queue.add('import', { format: format.data, redisKey }, { jobId })

  logger.info(
    {
      event: 'admin.import.enqueued',
      jobId,
      format: format.data,
      size: file.size,
    },
    'bulk import enqueued',
  )

  return jsonResponse({ jobId }, 202)
}

export const POST = withRequest<NextRequest, NextResponse>(handler)
