import type { Queue } from 'bullmq'

// Registry of all BullMQ queues. Workers in worker.ts spawn a Worker per entry.
// Future stories add to this list:
//   - 9.1 IGDB token refresh
//   - 9.2 Steam achievement sync
//   - 11.5 import wizard
//   - 11.6 similarity scan
export const queues: { name: string; queue?: Queue }[] = []
