import type { JSX } from 'react'
import type { Medium, MediaDims, Size } from '../media-registry'
import { ChromeAnime } from './ChromeAnime'
import { ChromeGames } from './ChromeGames'
import { ChromeManga } from './ChromeManga'
import { ChromeMovies } from './ChromeMovies'
import { ChromeTv } from './ChromeTv'

export type ChromeComponent = (props: { size: Size; dims: MediaDims; hex: string }) => JSX.Element

export const CHROME_BY_MEDIUM: Record<Medium, ChromeComponent> = {
  movies: ChromeMovies,
  tv: ChromeTv,
  anime: ChromeAnime,
  manga: ChromeManga,
  games: ChromeGames,
}

export { ChromeAnime, ChromeGames, ChromeManga, ChromeMovies, ChromeTv }
