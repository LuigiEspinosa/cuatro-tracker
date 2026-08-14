import { cleanupSeeded, disconnectSeed } from './fixtures/library-seed'

// Sweeps `e2e-seed-` rows left behind by a previously crashed run, so no run
// inherits fixture state. It never seeds: admin-dashboard asserts
// `0 PENDING SUGGESTIONS` and timeline asserts LIBRARY EMPTY, both against a
// baseline this hook must not disturb.
export default async function globalSetup(): Promise<void> {
  try {
    await cleanupSeeded()
  } finally {
    // finally, not a plain sequence: a cleanup that throws (a refused remote
    // database, a transient connection reset) would otherwise leave this
    // process holding an open Prisma pool.
    await disconnectSeed()
  }
}
