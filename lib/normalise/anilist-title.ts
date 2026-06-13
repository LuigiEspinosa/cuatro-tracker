import type { AnilistMedia } from '@/lib/api/anilist'

// Single source for the AniList title fallback chain, shared by the anime and
// manga normalisers (lib/normalise/{anime,manga}.ts) and the search-federation
// adapter (lib/search/federation.ts). It was inlined in all three with a
// `?? ''` tail, which carried two defects the Epic 8 retro closed
// (ECH-8-2-2 / ECH-8-3-5):
//   1. a `??` chain does not skip an empty-string field, so a present-but-blank
//      romaji shadowed a populated english.
//   2. the `?? ''` tail let a blank string persist as MediaItem.title (a blank
//      tile on the chronological timeline) and render an empty search heading.
// This helper skips blank/whitespace-only fields and substitutes a
// deterministic, identifiable placeholder rather than ''.
//
// userPreferred is honoured first: it is AniList's locale-aware convenience
// field, so a future "display titles as: English" setting needs no normaliser
// change. The Story 8.2 spec chain romaji -> english -> native follows.
//
// * Roads not taken: throwing on an all-null title. Rejecting the row would
//   drop a real (if poorly-tagged) AniList entry from the library; a labelled
//   placeholder keeps it trackable and makes the gap visible in the UI.
// Exported for the normalisers' original_title field, which needs the same
// blank-skipping (a present-but-whitespace native must persist as null, not '').
// The survivor is returned trimmed: padded AniList fields would otherwise leak
// whitespace into stored titles, sort keys, and merge-similarity inputs.
export function firstNonBlank(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (value == null) continue
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

export function preferredAnilistTitle(
  title: AnilistMedia['title'],
  anilistId: number,
): string {
  return (
    firstNonBlank(
      title.userPreferred,
      title.romaji,
      title.english,
      title.native,
    ) ?? `[Untitled #${anilistId}]`
  )
}
