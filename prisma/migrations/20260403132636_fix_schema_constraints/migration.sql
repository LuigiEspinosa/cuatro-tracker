/*
  Warnings:

  - Made the column `release_date` on table `MediaItem` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "MediaItem" ALTER COLUMN "release_date" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
