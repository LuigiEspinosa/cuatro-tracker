---
story: 8.1
branch: epic-8-anilist
mode: direct-from-epic-spec
spec_source: ../../../_bmad-output/planning-artifacts/epics.md (lines 1999-2029)
---

# Story 8.1 — Establish AniList GraphQL adapter (delivery file)

This document is a future-reference summary of the in-session implementation of Story 8.1. The authoritative acceptance criteria live in `_bmad-output/planning-artifacts/epics.md` (Epic 8, Story 8.1, lines 1999-2029). No separate impl-artifact was generated; we worked from the epic spec plus the existing TMDB adapter as the pattern reference.

## Summary

Story 8.1 establishes the typed AniList GraphQL client at `lib/api/anilist.ts`, mirroring the structure of the existing TMDB adapter. It is the foundation Stories 8.2 (anime + manga normalisers) and 8.3 (federated search dispatch) build on. Four changes land together as one commit on `epic-8-anilist`:

1. **`lib/api/anilist.ts`** — typed GraphQL client. `AnilistApiError` carries `endpoint`, `httpStatus`, `fieldPath`, optional `retryAfterMs`, and `cause`. Zod schemas cover the `Media` surface the normalisers in 8.2 will consume (title, fuzzy date, cover image, studios, relation edges, etc.). In-module concurrency limiter caps in-flight requests at 2. `anilistFetch` POSTs JSON, validates via Zod, and surfaces 429 / GraphQL-envelope / parse-failure paths distinctly. Public exports: `searchAnime`, `searchManga`, `getMedia(id, format)`, `getMediaRelations(id)`, plus the `partialDateToDate` helper.

2. **`lib/env.ts`** — adds `ANILIST_USER_AGENT: z.string().default('cuatro-tracker/1.0')`. AniList has no API key for public queries but their community guidance asks callers to identify themselves; the env var lets each deploy override with a contact-friendly UA.

3. **`.env.example`** — documents `ANILIST_USER_AGENT` next to the other external-API entries.

4. **`lib/api/__tests__/anilist.test.ts`** — 14 unit tests covering every AC-5 case plus the GraphQL error envelope and field-path parse failure.

## Reasoning

### Why an in-module concurrency limiter instead of `p-limit`

AC-2 references `pLimit(2)` as a possible implementation. `p-limit` is in the transitive tree (via BullMQ) but isn't a direct dependency. Adding it as a direct dep for a five-line primitive isn't worth the supply-chain surface — the in-module `Set<Promise<unknown>>` + `Promise.race` pattern is six lines, has no closure-over-promise bugs (the promise is added to the set before its `then` runs), and never has to release a slot manually (every promise's `finally` handler does it). If a future story needs cross-process rate coordination (Epic 11 bulk imports running across N workers), revisit and replace with a Redis token bucket; the public surface stays identical.

### Why `partialDateToDate` returns `null` instead of a 1970 sentinel

NFR14 is about the construction shape (`new Date(year, (month ?? 1) - 1, day ?? 1)`) — not about what to do when `year` itself is missing. The 1970-01-01 sentinel is a normaliser concern (Story 8.2), not an adapter concern. Returning `null` here keeps the helper truthful: "we cannot anchor a date without a year" is a different statement than "this thing happened in 1970." The normaliser will translate `null → sentinel` and add the test for that.

### Why GraphQL error envelopes are surfaced as `AnilistApiError`

AniList returns HTTP 200 with `{ errors: [...] }` for schema-level failures (unknown field, type mismatch, deprecated arg). The TMDB adapter doesn't have an analogue because TMDB uses HTTP status codes for everything. Folding these into the same error class (with `httpStatus: 200` and the first error's `message` in the thrown message) keeps callers from having to branch on transport vs schema bugs at the call site — both surface as "adapter said no, log and move on."

### Failure mode / Roads not taken / Long-term cost

- **Failure mode:** AniList's 429 `Retry-After` header is in seconds and is advisory; the adapter throws immediately and does not retry. Callers are expected to honor `retryAfterMs` themselves. For BullMQ jobs that's natural; for interactive route handlers it means a 429 surfaces as a `partialFailure: true` in Story 8.3's federated search response (per that story's spec).
- **Failure mode:** The in-module limiter is per-process. Two Node processes (the Next.js app + the BullMQ worker) running concurrently can each send up to 2 in flight, so effective worst case is 4 concurrent against the 90/min budget. Still well within budget for normal traffic; flagged in case Epic 11 bulk imports start tripping 429s in practice.
- **Roads not taken:** Building a Redis-backed token bucket up front. Rejected — premature for a single-tenant single-host app. Revisit if bulk imports scale up or a second app process is added.
- **Roads not taken:** Returning a discriminated `{ ok, data } | { ok: false, error }` result from each public function instead of throwing. Rejected for symmetry with `tmdb.ts` and because the route-handler layer already centralises error-to-status mapping via try/catch.
- **Long-term cost:** The Zod schemas in this file overlap with what Story 8.2 normalisers will project. If 8.2 introduces a smaller "internal AniList shape" type that the normaliser maps from, prune the unused `optional()` chains on the adapter side at that time.

## Files touched

- `cuatro-tracker/lib/api/anilist.ts` — +508 / 0 (new file: error class, Zod schemas, `partialDateToDate`, concurrency limiter, `anilistFetch`, four public exports, inline GraphQL operations).
- `cuatro-tracker/lib/api/__tests__/anilist.test.ts` — +364 / 0 (new file: 14 tests across `partialDateToDate` (5), `searchAnime` (2), `searchManga` (1), `getMedia` (3), `getMediaRelations` (1), rate limiting + GraphQL envelope (2)).
- `cuatro-tracker/lib/env.ts` — +3 / 0 (`ANILIST_USER_AGENT` added to the Zod env schema with default `cuatro-tracker/1.0` and an explanatory comment).
- `cuatro-tracker/.env.example` — +3 / 0 (`ANILIST_USER_AGENT="cuatro-tracker/1.0"` documented next to the other external-API vars).

Total: +878 / 0 across 4 files (2 new, 2 modified).

## Commit message

`feat(anilist): establish AniList GraphQL adapter`

(Single commit on `epic-8-anilist`. The four files are one cohesive unit — the adapter cannot land without the env var, the tests assert the adapter behaviour, and `.env.example` mirrors the env schema by convention.)

## How to verify

### Static gates

```powershell
cd cuatro-tracker
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm vitest run lib/api/__tests__/anilist.test.ts
```

Expected: typecheck green, lint green (zero warnings), 14/14 tests green.

Full sweep:

```powershell
corepack pnpm test
```

Expected: 702/702 unit tests green when Redis is up (`pnpm infra` first). The two `lib/jobs/__tests__/worker.test.ts` cases require a running Redis per repo convention; they pass on a clean Redis and are not regressed by this story.

### Live smoke (optional, hits the real AniList API)

```powershell
# Inside cuatro-tracker:
corepack pnpm tsx -e "import('./lib/api/anilist').then(async m => { const r = await m.searchAnime('Frieren'); console.log(r.length, r[0]?.title) })"
```

Expected: a small integer (1-25) and a Frieren title object. This validates the Zod schemas against a live response once before merge; do not commit the snippet.

### Debugging notes

- **Tests timeout in the 429 case:** the limiter's `Promise.race` waits on whatever's in `inflight`. If a test's mock `fetch` never resolves (forgot to return a `Response`), the next call's `withLimit` will block forever. Always have the mock return a `Response` — even for the rejecting path, throw inside the schema validation, not before the fetch returns.
- **Schema parse failure with a confusing `fieldPath`:** AniList sometimes returns enum strings that aren't in the documented set (e.g. status `CANCELLED` vs `CANCELED`). When that happens the parse error's `fieldPath` will point at the enum field. Add the missing variant to the Zod enum and re-run.
- **`User-Agent` not landing on the request:** Node's `fetch` (undici) silently strips some headers in restricted contexts. The User-Agent test asserts the spy received it as an init arg — if a future runtime strips it on the wire, switch to a `Request` instance construction.

## Apply checklist

- [x] `lib/api/anilist.ts` created with `AnilistApiError`, Zod schemas, `partialDateToDate`, concurrency limiter, `anilistFetch`, and four public exports (`searchAnime`, `searchManga`, `getMedia`, `getMediaRelations`).
- [x] `lib/api/__tests__/anilist.test.ts` covers every AC-5 case plus GraphQL-envelope errors and schema-mismatch field paths (14/14 green).
- [x] `lib/env.ts` extends the Zod env schema with `ANILIST_USER_AGENT` and a default.
- [x] `.env.example` documents the new optional env var.
- [x] Static gates green: typecheck, lint (zero warnings), full vitest (702/702 with Redis up).
- [x] Single commit `feat(anilist): establish AniList GraphQL adapter` on `epic-8-anilist`.
- [ ] Branch pushed to origin and PR opened (deferred — Cuatro pushes manually per project policy).
- [ ] Sprint-status flipped: `8-1-establish-anilist-graphql-adapter = done`, `epic-8 = in-progress` (queue for the closeout step).
- [ ] Story 8.2 (anime + manga normalisers) and 8.3 (federated search dispatch) opened as follow-up PRs.
