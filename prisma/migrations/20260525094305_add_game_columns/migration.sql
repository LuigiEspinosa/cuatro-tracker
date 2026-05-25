-- Story 9.3: add MediaItem columns required for IGDB game normaliser + Steam
-- cross-link, plus rename steam_id -> steam_app_id (Q3 locked; no existing
-- GAME rows so no data-migration block needed).
-- CHECK constraint mirrors UserEntry.progress >= 0 from
-- 20260508133713_phase2_constraint_hardening; Prisma DSL cannot express it.
ALTER TABLE "MediaItem" ADD COLUMN "screenshots" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "MediaItem" ADD COLUMN "platforms" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "MediaItem" ADD COLUMN "developer_name" TEXT;

ALTER TABLE "MediaItem" ADD COLUMN "publisher_name" TEXT;

ALTER TABLE "MediaItem" ADD COLUMN "playtime_minutes" INTEGER;

ALTER TABLE "MediaItem"
  ADD CONSTRAINT "MediaItem_playtime_minutes_check"
  CHECK ("playtime_minutes" IS NULL OR "playtime_minutes" >= 0);

ALTER TABLE "MediaItem" ADD COLUMN "last_played" TIMESTAMP(3);

ALTER TABLE "MediaItem" RENAME COLUMN "steam_id" TO "steam_app_id";

ALTER INDEX "MediaItem_steam_id_key" RENAME TO "MediaItem_steam_app_id_key";
