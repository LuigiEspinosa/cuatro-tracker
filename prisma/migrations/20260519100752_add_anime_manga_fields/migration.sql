-- Anime + manga metadata columns on MediaItem (Story 8.2 prep).
-- All columns NULLable so existing MOVIE / TV_SHOW / TV_EPISODE / GAME rows
-- remain valid without backfill. Anime is modelled as a single MediaItem
-- (no per-episode rows like TV) — progress on UserEntry tracks watched-count,
-- and episode_count holds the aired total.
--
-- Pure additive ALTER TABLE: no existing column is touched, no constraint
-- (including the raw-SQL partial-unique / CHECK constraints from
-- 20260403132636_fix_schema_constraints and 20260508133713_phase2_constraint_hardening)
-- is modified.

ALTER TABLE "MediaItem"
  ADD COLUMN "episode_count"   INTEGER,
  ADD COLUMN "chapter_count"   INTEGER,
  ADD COLUMN "volume_count"    INTEGER,
  ADD COLUMN "format"          TEXT,
  ADD COLUMN "studio_name"     TEXT,
  ADD COLUMN "author_name"     TEXT,
  ADD COLUMN "season"          TEXT,
  ADD COLUMN "season_year"     INTEGER,
  ADD COLUMN "source_material" TEXT;
