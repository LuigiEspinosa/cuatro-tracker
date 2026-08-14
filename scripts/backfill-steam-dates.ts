/* Enqueues one steamDateEnrich job in backfill mode.
 *
 * The job itself only ever runs on demand: it is registered in the queue
 * registry but deliberately absent from CRONS, and the bulk import only names
 * the rows it just created. Without this entrypoint the backfill mode the
 * processor documents has no caller at all, so Steam rows that entered the
 * library before date enrichment shipped, or during a run that failed, stay at
 * the 1970 sentinel forever: invisible on the timeline and excluded from the
 * duplicate scan.
 *
 * Needs a running worker and Redis. Run it as:
 *
 *   corepack pnpm exec tsx --env-file=.env scripts/backfill-steam-dates.ts
 *
 * The worker entrypoint is what actually processes the job, so watch its log
 * for job.enrich.complete and its { scanned, matched, dated, unmatched, failed }
 * totals. Omitting mediaItemIds selects every sentinel-dated Steam row; the
 * sentinel filter lives in the processor's where clause, so this can never
 * overwrite a row that already carries a real date.
 */
import { redis } from '@/lib/redis'
import { queues } from '@/lib/jobs/queues'
import { STEAM_DATE_ENRICH_QUEUE } from '@/lib/jobs/steamDateEnrich'

async function main(): Promise<void> {
  const entry = queues.find((q) => q.name === STEAM_DATE_ENRICH_QUEUE)
  if (!entry) throw new Error('steamDateEnrich queue is not registered')

  // ! Three colon-separated parts, no more: BullMQ rejects a custom job id
  // ! containing a colon unless it splits into exactly three.
  const jobId = `${STEAM_DATE_ENRICH_QUEUE}:backfill:${Date.now()}`
  await entry.queue.add(
    'enrich',
    {},
    {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    },
  )

  process.stdout.write(`enqueued ${jobId}\n`)
  process.stdout.write('watch the worker log for job.enrich.complete\n')
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await redis.quit()
  })
