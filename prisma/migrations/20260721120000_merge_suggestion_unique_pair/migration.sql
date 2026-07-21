-- Story 11.6: unique index on the MergeSuggestion pair, so the post-import
-- similarity scan can never write the same (source_id, target_id) twice even if
-- two scans race. Additive and non-breaking: the DO block first removes any
-- pre-existing duplicate pair (keeping the physically first row by ctid), which
-- mirrors the delete-then-constrain pattern used for the CHECK constraints in
-- 20260508133713_phase2_constraint_hardening.
--
-- ! The constraint covers (A, B) only, NOT the mirrored (B, A). The
-- ! either-orientation lookup in similarityScanProcessor is the real guarantee;
-- ! this index is the backstop.
--
-- Hand-authored to match the sibling additive migrations (add_game_columns,
-- user_entry_volume_progress, merge_suggestion_dismissed_resolved_at).
-- `prisma migrate dev` on this schema folds in a spurious full unique index on
-- User.email: the DSL `@unique` diverges from the raw-SQL partial unique index
-- created in 20260508133713_phase2_constraint_hardening (WHERE email IS NOT
-- NULL), which the Prisma DSL cannot express. Emitting only these statements
-- keeps that drift-correction out, per the schema-top warning block. The index
-- name matches Prisma's `<Model>_<col>_<col>_key` convention so a future
-- migrate diff sees no drift. IF NOT EXISTS makes the migration idempotent on a
-- partially-applied dev DB.
DO $$
DECLARE removed INTEGER;
BEGIN
  DELETE FROM "MergeSuggestion" a
    USING "MergeSuggestion" b
    WHERE a."source_id" = b."source_id"
      AND a."target_id" = b."target_id"
      AND a.ctid > b.ctid;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'Removed MergeSuggestion duplicate pairs: % rows', removed;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "MergeSuggestion_source_id_target_id_key"
  ON "MergeSuggestion"("source_id", "target_id");
