// Default chapters per volume. Used by:
// - ChapterVolumeTracker molecule (MARK VOLUME N COMPLETE math)
// - UserEntry.volume_progress migration backfill
// - /api/progress MANGA branch (no direct use today; reserved for future per-manga override)
//
// * Failure mode: drift between this constant and the migration's hardcoded
//   10 silently corrupts new manga rows on a later migration. The
//   migration.sql comment names this file; the test in __tests__/manga.test.ts
//   pins the value so a regression fails CI.
export const CHAPTERS_PER_VOLUME = 10
