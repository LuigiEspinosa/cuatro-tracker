-- UserEntry.volume_progress for manga two-axis tracking (Story 8.6).
-- Non-null with default 0 so existing rows (movies, TV, anime, games) stay
-- valid without backfill. Existing MANGA rows backfill via the chapters-per-volume
-- default; new MANGA rows start at 0 and advance via PUT /api/progress.
--
-- The IF NOT EXISTS clause and the WHERE volume_progress = 0 guard on the
-- backfill UPDATE make the migration idempotent — re-running it (e.g. on a
-- partially-applied dev DB) is a no-op rather than a failure.

ALTER TABLE "UserEntry"
  ADD COLUMN IF NOT EXISTS "volume_progress" INTEGER NOT NULL DEFAULT 0;

-- Backfill MANGA rows. The literal 10 mirrors CHAPTERS_PER_VOLUME in
-- lib/constants/manga.ts. Update both together if the default ever changes.
UPDATE "UserEntry" AS ue
   SET "volume_progress" = FLOOR(ue."progress"::numeric / 10)
 WHERE ue."volume_progress" = 0
   AND EXISTS (
     SELECT 1
       FROM "MediaItem" mi
      WHERE mi.id = ue.media_item_id
        AND mi.type = 'MANGA'
   );
