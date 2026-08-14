import { cleanupSeeded, disconnectSeed } from './fixtures/library-seed'

// Sweeps `e2e-seed-` rows after the last test, so a failed spec that never
// reached its afterAll cannot leak fixture state into the next run.
export default async function globalTeardown(): Promise<void> {
  try {
    await cleanupSeeded()
  } finally {
    await disconnectSeed()
  }
}
