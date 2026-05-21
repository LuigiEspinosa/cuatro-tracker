-- Story 9.2: track Steam achievement sync state per game.
-- Default 'never_synced' covers all existing rows (no GAME rows exist yet but
-- the column is non-null for every MediaItem so non-game types take the same
-- default; the sync job only touches type = 'GAME' rows).
ALTER TABLE "MediaItem"
  ADD COLUMN "achievement_sync_status" TEXT NOT NULL DEFAULT 'never_synced';

-- CHECK constraint. Prisma DSL cannot express this; the SQL is the source
-- of truth. Mirrors the pattern at 20260508133713_phase2_constraint_hardening.
ALTER TABLE "MediaItem"
  ADD CONSTRAINT "MediaItem_achievement_sync_status_check"
  CHECK ("achievement_sync_status" IN ('ok', 'private_profile', 'never_synced', 'failed'));
