-- Achievement composite unique (Prisma-generated from @@unique).
-- Backfill must run BEFORE the index is created, so the duplicate-removal
-- block sits above the CREATE UNIQUE INDEX statement.
DO $$
DECLARE removed INTEGER;
BEGIN
  WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (
      PARTITION BY "game_id", "steam_api_name" ORDER BY "id"
    ) AS rn
    FROM "Achievement"
  )
  DELETE FROM "Achievement" WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'Removed Achievement duplicates: % rows', removed;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_game_id_steam_api_name_key" ON "Achievement"("game_id", "steam_api_name");

-- UserEntry.user_rating CHECK 1-10 (NULL allowed)
DO $$
DECLARE repaired INTEGER;
BEGIN
  UPDATE "UserEntry" SET "user_rating" = NULL
    WHERE "user_rating" IS NOT NULL
      AND ("user_rating" < 1 OR "user_rating" > 10 OR "user_rating" <> "user_rating");
  GET DIAGNOSTICS repaired = ROW_COUNT;
  RAISE NOTICE 'Repaired UserEntry.user_rating: % rows', repaired;
END $$;

ALTER TABLE "UserEntry" ADD CONSTRAINT "UserEntry_user_rating_check"
  CHECK ("user_rating" IS NULL OR ("user_rating" >= 1 AND "user_rating" <= 10));

-- UserEntry.progress CHECK >= 0
DO $$
DECLARE repaired INTEGER;
BEGIN
  UPDATE "UserEntry" SET "progress" = 0 WHERE "progress" < 0;
  GET DIAGNOSTICS repaired = ROW_COUNT;
  RAISE NOTICE 'Repaired UserEntry.progress: % rows', repaired;
END $$;

ALTER TABLE "UserEntry" ADD CONSTRAINT "UserEntry_progress_check"
  CHECK ("progress" >= 0);

-- MergeSuggestion source_id <> target_id CHECK
DO $$
DECLARE removed INTEGER;
BEGIN
  DELETE FROM "MergeSuggestion" WHERE "source_id" = "target_id";
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'Removed MergeSuggestion self-references: % rows', removed;
END $$;

ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_source_target_check"
  CHECK ("source_id" <> "target_id");

-- MergeSuggestion.confidence CHECK 0-1
DO $$
DECLARE removed INTEGER;
BEGIN
  DELETE FROM "MergeSuggestion"
    WHERE "confidence" < 0 OR "confidence" > 1 OR "confidence" <> "confidence";
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'Removed MergeSuggestion out-of-range confidence: % rows', removed;
END $$;

ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_confidence_check"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);

-- User.email: replace full unique index with partial unique (WHERE email IS NOT NULL).
-- Postgres default unique already permits multiple NULLs; the partial form is
-- explicit about the invariant and produces a smaller index.
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_email_key" ON "User" ("email") WHERE "email" IS NOT NULL;
