import { type NextRequest } from 'next/server'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { queues } from '@/lib/jobs/queues'
import {
  BULK_IMPORT_CHANNEL_PREFIX,
  BULK_IMPORT_QUEUE,
} from '@/lib/jobs/bulkImport'

export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 15_000

/* `GET /api/admin/import/[jobId]/events` (Story 11.5 AC-4 / AC-7): a
 * text/event-stream that relays the bulkImport job's Redis pub/sub progress.
 *
 * Subscribes on redis.duplicate(): once an ioredis client enters subscriber
 * mode it rejects ordinary commands, so the shared singleton must never be used
 * for the subscription. The duplicate is torn down (unsubscribe + disconnect)
 * on the terminal frame, on request abort, and on stream cancel.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await params
  const channel = `${BULK_IMPORT_CHANNEL_PREFIX}${jobId}`
  const sub = redis.duplicate()
  const encoder = new TextEncoder()

  let closed = false
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const cleanup = async () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        try {
          await sub.unsubscribe(channel)
        } catch {
          // Already torn down; disconnect below is the hard stop.
        }
        sub.disconnect()
        try {
          controller.close()
        } catch {
          // Controller already closed by a concurrent terminal frame / abort.
        }
      }

      sub.on('message', (_ch: string, message: string) => {
        if (closed) return
        let phase: string | undefined
        try {
          phase = (JSON.parse(message) as { phase?: string }).phase
        } catch {
          phase = undefined
        }
        const isTerminal = phase === 'complete' || phase === 'error'
        const frame = isTerminal
          ? `event: ${phase}\ndata: ${message}\n\n`
          : `data: ${message}\n\n`
        try {
          controller.enqueue(encoder.encode(frame))
        } catch {
          // Reader gone; cleanup runs via abort / cancel.
        }
        if (isTerminal) void cleanup()
      })

      try {
        await sub.subscribe(channel)
      } catch (err) {
        logger.error(
          { event: 'admin.import.sse.subscribe_failed', jobId, err },
          'import SSE subscribe failed',
        )
        await cleanup()
        return
      }

      // Prime the stream so the client's EventSource opens immediately, then a
      // periodic comment keeps an idle proxy from dropping the socket.
      controller.enqueue(encoder.encode(`: connected ${jobId}\n\n`))
      heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          // Reader gone between ticks; cleanup runs via abort / cancel.
        }
      }, HEARTBEAT_MS)

      req.signal.addEventListener('abort', () => {
        void cleanup()
      })

      // Recover a terminal frame the client would otherwise miss: if the job
      // already finished before this stream subscribed, its complete/error
      // frame was published to nobody (Redis pub/sub has no replay). Read
      // BullMQ's stored state and synthesize the frame. The subscribe above ran
      // first, so a job that finishes during this check still delivers live;
      // the client closes on the first terminal frame, so a duplicate is inert.
      if (closed) return
      try {
        const entry = queues.find((q) => q.name === BULK_IMPORT_QUEUE)
        const job = entry ? await entry.queue.getJob(jobId) : undefined
        if (job) {
          const state = await job.getState()
          if (state === 'completed') {
            const result = (job.returnvalue ?? {}) as Record<string, unknown>
            controller.enqueue(
              encoder.encode(
                `event: complete\ndata: ${JSON.stringify({ phase: 'complete', ...result })}\n\n`,
              ),
            )
            void cleanup()
          } else if (state === 'failed') {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ phase: 'error', reason: job.failedReason ?? 'import failed' })}\n\n`,
              ),
            )
            void cleanup()
          }
        }
      } catch (err) {
        logger.error(
          { event: 'admin.import.sse.state_check_failed', jobId, err },
          'import SSE job state check failed',
        )
      }
    },
    cancel() {
      if (closed) return
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      void sub.unsubscribe(channel).catch(() => undefined)
      sub.disconnect()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
