-- Story 11.4: the two columns the /admin/merge accept + dismiss actions write.
-- Both additive and non-breaking on existing MergeSuggestion rows:
--   dismissed   NOT NULL DEFAULT false  (backfills every existing row to false)
--   resolved_at nullable                (null on rows resolved before this story)
--
-- Hand-authored to match the sibling additive migrations (add_game_columns,
-- user_entry_volume_progress). `prisma migrate dev` on this schema folds in a
-- spurious full unique index on User.email: the DSL `@unique` diverges from the
-- raw-SQL partial unique index created in
-- 20260508133713_phase2_constraint_hardening (WHERE email IS NOT NULL), which
-- the Prisma DSL cannot express. Emitting only these two ALTER statements keeps
-- that drift-correction out, per the schema-top warning block. IF NOT EXISTS
-- makes the migration idempotent on a partially-applied dev DB.
ALTER TABLE "MergeSuggestion"
  ADD COLUMN IF NOT EXISTS "dismissed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3);
