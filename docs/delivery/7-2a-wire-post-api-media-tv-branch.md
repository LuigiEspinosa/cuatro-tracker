---
story: 7.2a
issue: 124
branch: epic-7-tv
mode: main-session-with-delivery-file
impl_artifact: ../../_bmad-output/implementation-artifacts/7-2a-wire-post-api-media-tv-branch.md
---

# Story 7.2a — Wire POST /api/media TV branch (delivery file)

This document is a future-reference summary of the in-session implementation of Story 7.2a. Authoritative AC, OI, and review notes live in the impl-artifact at `_bmad-output/implementation-artifacts/7-2a-wire-post-api-media-tv-branch.md`.

## Summary

Story 7.2a wires `POST /api/media` for the TV-add path (epic AC-6), completing the work that was split out of Story 7.2 at its kickoff. Three changes land together as one commit on `epic-7-tv`:

1. **Dispatcher contract change** at `lib/search/media-dispatcher.ts`. The `AddMediaDispatcher.normalise` return type becomes the union `Prisma.MediaItemCreateInput | NormalisedShowWithEpisodes` where `NormalisedShowWithEpisodes = { show, episodes }`. The existing `(tmdb, MOVIE)` dispatcher is unchanged.

2. **TV dispatcher entry** in `getDispatcher()`. The `(tmdb, TV_SHOW)` branch's `fetch` orchestrates `getTv(id)` + N parallel `getTvSeason(id, n)` calls — filtered to seasons with `episode_count > 0` so empty future seasons are skipped (specials with episodes are INCLUDED per Story 7.2's OI #5). Returns `{ show, seasons }` passed verbatim to `normaliseTmdbTv`.

3. **Route handler TV branch** at `app/api/media/route.ts`. The single-shape handler splits into `persistSingleMediaItem` (movie path, behaviour unchanged) and `persistShowWithEpisodes` (TV branch). The TV branch runs cross-source merge with a `type === TV_SHOW` guard (so a 1984 movie can't accidentally cross-merge with a 1984 TV show), then a single atomic `db.$transaction(fn, { timeout: 30_000 })` that inserts the show + nested UserEntry + N episode rows with `parent_id` plumbing. P2002 handling: show-race → 200 idempotent recovery; episode-level (no racing show) → 500 `cross_type_tmdb_id_collision` for operator investigation.

## Reasoning

### Why Path 1 (discriminated `normalise` union) over Path 2 (`persist` method on the dispatcher)

The dispatcher contract had to change to accommodate the TV normaliser's `{ show, episodes }` shape. Path 2 (move all persistence into the dispatcher) is the right long-term call but doubles 7.2a's scope — it requires relocating `findExistingBySourceId`, `findCrossSourceCandidates`, `patchSourceId`, `ensureUserEntry`, and the entire P2002 handling logic into the dispatcher, then refactoring the movie path to maintain symmetry. Cuatro ratified Path 1 at kickoff for scope discipline. If the discrimination grows to 3+ branches (anime episodes E8, game DLC E9), revisit Path 2 as a dedicated refactor story.

### Why the same-parent re-import P2002 case is unreachable

The original handoff prescribed a per-collider `findUnique` to distinguish "benign re-import within the same show" from "cross-context collision." Mid-impl I realised the same-parent case is unreachable under Prisma's atomic transaction semantics + the existing fast-path `findExistingBySourceId`: if the show is already in the DB, the fast-path catches it before the transaction runs; if not, atomic transactions can't leave orphan episodes from a partial previous run. Therefore any P2002 inside the TV transaction is either a show-level race (recoverable via post-catch `findExistingBySourceId`) or a true cross-context collision (500). The OI #2 wording was updated in the impl-artifact to reflect this refined understanding.

### Why the transaction timeout is 30s

Breaking Bad has 62 episodes, Game of Thrones 73, Days of Our Lives 14,000+. A bulk-insert of 100+ rows via `createMany` plus the show insert plus the UserEntry insert is ~3-5 round-trips to Postgres at 10-50ms each over localhost. Prisma's default 5s leaves no margin for slow disk or autovacuum. 30s is the standard for similar Prisma bulk-insert patterns. The cost (wedged transactions hold locks longer in the edge case where they hang) is acceptable for an interactive add path.

### Failure mode / Roads not taken / Long-term cost

- **Failure mode:** A single flaky season fetch in `Promise.all(getTvSeason ...)` aborts the whole insert and returns 502. Resilience hardening (`Promise.allSettled` + per-season retry) is deferred to a follow-up story (ECH-T3 in `deferred-work.md`).
- **Failure mode:** Cross-context tmdb_id collision returns 500 without auto-recovery. The schema's global `tmdb_id @unique` is the root cause; the schema fix is the `@@unique([type, tmdb_id])` migration deferred to a follow-up (originally logged as ECH-4 from Story 7.2).
- **Roads not taken:** Path 3 (inline TV branch in `route.ts` without changing the dispatcher contract) was considered and rejected. It paints us into a corner the moment Epic 8 (anime episodes) and Epic 9 (game DLC) need similar parent + child shapes.
- **Long-term cost:** The `'episodes' in normalised` discriminator grows linearly with new mediums that need multi-row persistence. At 3+ mediums it's worth migrating to Path 2 (the `persist` method refactor). Surface in the Story 8.x or 9.x epic kickoff.

## Files touched

- `cuatro-tracker/lib/search/media-dispatcher.ts` — +34 / -1 (new `NormalisedShowWithEpisodes` type export, union return type on `AddMediaDispatcher.normalise`, new `(tmdb, TV_SHOW)` dispatcher entry).
- `cuatro-tracker/lib/search/__tests__/media-dispatcher.test.ts` — +103 / -8 (5 new TV dispatcher tests covering happy path, skip-empty-seasons, include-specials, missing-seasons, every-wired-tuple). The "every other tuple null" test updated to account for `(tmdb, TV_SHOW)` now being wired.
- `cuatro-tracker/app/api/media/route.ts` — +145 / -8 (handler split into `persistSingleMediaItem` + `persistShowWithEpisodes` + `logAndReturnConstraintViolation` helper; TV branch with multi-row transaction; show-race + cross-context-collision P2002 paths; `c.type === TV_SHOW` cross-source merge filter).
- `cuatro-tracker/app/api/media/__tests__/route.test.ts` — +394 / -4 (10 new TV branch tests across 5 describe blocks; existing `(tmdb, TV_SHOW) → 501` test updated to `(tmdb, ANIME) → 501`; dbMock extended with `$transaction`; new `txMock` for transaction callback; tmdbMock extended with `getTv` + `getTvSeason`).

LOC accounting (cumulative Epic 7 PR): +1162 / -72 entering 7.2a → ~+1838 / -93 after 7.2a (676 added, 21 removed). Sub-bundle cut at the 1.5K LOC ceiling per [[feedback_pr_size_ceiling]] is now likely before Story 7.5 — flag for the Epic 7 closeout planning.

## Commit message

`feat(api): wire POST /api/media TV branch (#124)`

(Single commit on `epic-7-tv` per OI #8 and [[feedback_bundle_pr_commit_per_issue]]. The work is cohesive — dispatcher contract change + route branch + tests aren't separable units of intent.)

## How to verify

### Static gates (run inside `cuatro-tracker-dev-1`)

```bash
docker exec -w /workspaces/cuatro-tracker cuatro-tracker-dev-1 bash -lc \
  'pnpm typecheck && pnpm lint --max-warnings=0 && pnpm vitest run app/api/media lib/normalise lib/search'
```

Expected: typecheck green, lint green, 120/120 scoped tests green. Full vitest sweep optional — expect the pre-existing `lib/jobs/__tests__/worker.test.ts` flake (2 failures) from Story 7.2's deferred-work log; unrelated to this story.

### Manual smoke (optional, requires live Postgres + TMDB credentials)

```bash
# Inside the dev container, hit the route with a real show (Breaking Bad = 1396).
docker exec -w /workspaces/cuatro-tracker cuatro-tracker-dev-1 bash -lc \
  "curl -s -X POST http://localhost:3000/api/media \
    -H 'Content-Type: application/json' \
    -H 'Cookie: <auth cookie>' \
    -d '{\"source\":\"tmdb\",\"sourceId\":1396,\"type\":\"TV_SHOW\"}' | jq .merged"
# Expected: false
```

Verify episode rows landed:

```bash
docker exec -w /workspaces/cuatro-tracker cuatro-tracker-dev-1 bash -lc \
  "psql \$DATABASE_URL -c \"SELECT count(*) FROM \\\"MediaItem\\\" WHERE type = 'TV_EPISODE' AND parent_id = (SELECT id FROM \\\"MediaItem\\\" WHERE tmdb_id = 1396);\""
# Expected: 62 (Breaking Bad's canonical episode count).
```

Idempotent retry:

```bash
# Re-run the same POST — should return 200 (not 201) and zero new inserts.
```

### Debugging notes

- **Test failures hit 422 across multiple TV tests:** the `validTmdbTv` fixture's `seasons[]` summaries are missing `id` or `name` (required by `TmdbSeasonSummarySchema`). Caught during initial test run on 2026-05-15 — the fixture was synthesised without consulting the schema. Fix: provide complete summary entries `{ id, season_number, name, episode_count }`.
- **TV branch returns 500 unexpectedly:** the only intentional 500 path is `cross_type_tmdb_id_collision`. Confirm by inspecting `media.tmdb_id_collision` log lines + checking the inbound episode `tmdb_id`s against `SELECT id, type, tmdb_id FROM "MediaItem" WHERE tmdb_id IN (<inbound ids>)`. If any return a row with `type != TV_EPISODE` or a different show's parent, the collision is real.
- **Transaction timeout under heavy load:** Prisma 30s timeout is on the wall-clock duration, not idle time. Long-running shows (1000+ episodes) might trip it. Mitigation if it happens: chunk `createMany` into batches of 200 inside the transaction.

## Apply checklist

- [x] `media-dispatcher.ts` union return type + TV dispatcher entry.
- [x] `media-dispatcher.test.ts` updated to reflect `(tmdb, TV_SHOW)` wiring + 4 new TV dispatcher tests.
- [x] `route.ts` split into movie + TV persist functions; TV transaction with 30s timeout; show-race + cross-context-collision P2002 paths; cross-source merge guarded by `c.type === TV_SHOW`.
- [x] `route.test.ts` extended with TV branch describe block (10 new tests across happy path, idempotent, cross-source merge, empty seasons, error paths) + updated existing `(tmdb, TV_SHOW) → 501` to `(tmdb, ANIME) → 501`.
- [x] Static gates green: typecheck, lint, 120/120 scoped vitest.
- [x] `bmad-code-review` run: 9/9 ACs verified, 6/8 OIs verified (2 pending-closeout), 12+1 EC findings → 0 patch / 7 defer / 6 dismiss.
- [x] Deferred items logged to `_bmad-output/implementation-artifacts/deferred-work.md` under "Deferred from: code review of Story 7.2a (2026-05-15)".
- [x] Impl-artifact Status flipped to `done` + Dev Agent Record populated.
- [x] Sprint-status flipped: `7-2a = done`. `epic-7 = in-progress` retained.
- [x] Single commit `feat(api): wire POST /api/media TV branch (#124)` on `epic-7-tv`; pushed.
- [x] Issue #124 stays open per per-epic-bundle pattern.

(All checkboxes filled at commit time. If you're reading this and one is unchecked, the closeout was interrupted — re-run from the unchecked step.)
