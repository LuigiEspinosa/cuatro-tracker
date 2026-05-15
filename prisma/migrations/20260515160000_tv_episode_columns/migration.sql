-- Story 7.2: TV + episode normaliser columns on MediaItem.
-- All ADD COLUMNs are nullable or carry a safe default so existing movie / show
-- rows (Epics 4, 6) backfill cleanly without backfill SQL.

-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN     "episode_number" INTEGER,
ADD COLUMN     "lifecycle_status" TEXT,
ADD COLUMN     "runtime" INTEGER,
ADD COLUMN     "season_number" INTEGER,
ADD COLUMN     "still_path" TEXT,
ADD COLUMN     "unaired" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: timeline chronological sort within a show (Epic 10).
CREATE INDEX "MediaItem_season_number_episode_number_idx" ON "MediaItem"("season_number", "episode_number");

-- CreateIndex: TV grid 'Continuing' filter chip (Story 7.4).
CREATE INDEX "MediaItem_lifecycle_status_idx" ON "MediaItem"("lifecycle_status");
