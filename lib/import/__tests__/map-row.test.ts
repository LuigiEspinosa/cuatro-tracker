import { describe, it, expect } from 'vitest'
import { MediaType, WatchStatus } from '@prisma/client'
import { toDispatch, toUserEntry } from '@/lib/import/map-row'
import type {
  MalRow,
  SteamRow,
  TraktRow,
} from '@/lib/import/formats'

const traktMovie: TraktRow = {
  format: 'TRAKT_JSON',
  tmdbId: 27205,
  mediaType: 'movie',
  title: 'Inception',
  watched: true,
  rating: 8,
}

const traktShow: TraktRow = {
  format: 'TRAKT_JSON',
  tmdbId: 1438,
  mediaType: 'show',
  title: 'The Wire',
  watched: false,
  rating: null,
}

const malAnime: MalRow = {
  format: 'MAL_XML',
  malId: 21,
  mediaType: 'anime',
  title: 'One Piece',
  status: 'Watching',
  progress: 500,
  score: 9,
}

const malManga: MalRow = {
  format: 'MAL_XML',
  malId: 13,
  mediaType: 'manga',
  title: 'Berserk',
  status: 'Plan to Read',
  progress: 0,
  score: 0,
}

const steamGame: SteamRow = {
  format: 'STEAM_EXPORT',
  appid: 570,
  name: 'Dota 2',
  playtimeForever: 1200,
  rtimeLastPlayed: 1600000000,
}

describe('toDispatch', () => {
  it('maps a Trakt movie to the tmdb MOVIE tuple', () => {
    expect(toDispatch(traktMovie)).toEqual({
      source: 'tmdb',
      sourceId: 27205,
      type: MediaType.MOVIE,
    })
  })

  it('maps a Trakt show to the tmdb TV_SHOW tuple', () => {
    expect(toDispatch(traktShow)).toEqual({
      source: 'tmdb',
      sourceId: 1438,
      type: MediaType.TV_SHOW,
    })
  })

  it('maps a MAL anime to the anilist-mal ANIME tuple by MAL id', () => {
    expect(toDispatch(malAnime)).toEqual({
      source: 'anilist-mal',
      sourceId: 21,
      type: MediaType.ANIME,
    })
  })

  it('maps a MAL manga to the anilist-mal MANGA tuple', () => {
    expect(toDispatch(malManga)).toEqual({
      source: 'anilist-mal',
      sourceId: 13,
      type: MediaType.MANGA,
    })
  })

  it('maps a Steam row to the steam GAME tuple by appid', () => {
    expect(toDispatch(steamGame)).toEqual({
      source: 'steam',
      sourceId: 570,
      type: MediaType.GAME,
    })
  })
})

describe('toUserEntry', () => {
  it('maps a watched Trakt row to COMPLETED with its rating', () => {
    expect(toUserEntry(traktMovie)).toEqual({
      status: WatchStatus.COMPLETED,
      progress: 0,
      user_rating: 8,
    })
  })

  it('maps an unwatched Trakt row to PLAN_TO_WATCH', () => {
    expect(toUserEntry(traktShow)).toEqual({
      status: WatchStatus.PLAN_TO_WATCH,
      progress: 0,
      user_rating: null,
    })
  })

  it('maps MAL statuses, progress, and score (0 = unrated)', () => {
    expect(toUserEntry(malAnime)).toEqual({
      status: WatchStatus.WATCHING,
      progress: 500,
      user_rating: 9,
    })
    expect(toUserEntry(malManga)).toEqual({
      status: WatchStatus.PLAN_TO_WATCH,
      progress: 0,
      user_rating: null,
    })
  })

  it('maps every MAL status string and numeric code', () => {
    const status = (raw: string) =>
      toUserEntry({ ...malAnime, status: raw }).status
    expect(status('Completed')).toBe(WatchStatus.COMPLETED)
    expect(status('On-Hold')).toBe(WatchStatus.ON_HOLD)
    expect(status('Dropped')).toBe(WatchStatus.DROPPED)
    expect(status('Reading')).toBe(WatchStatus.WATCHING)
    expect(status('2')).toBe(WatchStatus.COMPLETED)
    expect(status('6')).toBe(WatchStatus.PLAN_TO_WATCH)
    expect(status('unknown-thing')).toBe(WatchStatus.PLAN_TO_WATCH)
  })

  it('maps a played Steam game to WATCHING and an unplayed one to PLAN_TO_WATCH', () => {
    expect(toUserEntry(steamGame)).toEqual({
      status: WatchStatus.WATCHING,
      progress: 0,
      user_rating: null,
    })
    expect(toUserEntry({ ...steamGame, playtimeForever: 0 }).status).toBe(
      WatchStatus.PLAN_TO_WATCH,
    )
  })
})
