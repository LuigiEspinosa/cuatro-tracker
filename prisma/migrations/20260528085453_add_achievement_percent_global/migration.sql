-- Story 9.5: Achievement.percent_global column for RARE / UNCOMMON / COMMON rarity chips on the /games/[id] detail page.
-- Nullable: Steam's GetGlobalAchievementPercentagesForApp returns 403/404 for some apps and the adapter swallows that to null.
-- No CHECK constraint (Q-CHECK): Steam can return values slightly above 100 on small player populations; clamp at render time instead.
ALTER TABLE "Achievement" ADD COLUMN "percent_global" DOUBLE PRECISION;
