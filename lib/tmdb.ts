const TMDB_BASE = 'https://api.themoviedb.org/3'
const key = process.env.TMDB_API_KEY!

export type TMDBMovie = {
  id: number
  title: string
  release_date?: string | null
  poster_path?: string | null
  backdrop_path?: string | null
  popularity?: number | null
}

async function tmdb(path: string, init?: RequestInit) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', 'en-Us');

  const res = await fetch(url, { ...init, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);

  return res.json();
}

export async function getPopular(page = 1, dir: 'asc' | 'desc' = 'desc') {
  return tmdb(`/discover/movie?sort_by=popularity.${dir}&page=${page}`)
}

export async function getTrending(time_window: 'day' | 'week' = 'day', page = 1) {
  return tmdb(`/trending/movie/${time_window}?page=${page}`)
}

export async function searchMovies(q: string, page = 1) {
  return tmdb(`/search/movie?query=${encodeURIComponent(q)}&page=${page}`)
}

export async function getByRelease(page = 1, dir: 'asc' | 'desc' = 'desc') {
  const today = new Date()
  const yyyy = today.getUTCFullYear()
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(today.getUTCDate()).padStart(2, '0')
  const lte = `${yyyy}-${mm}-${dd}`

  return tmdb(
    `/discover/movie?sort_by=primary_release_date.${dir}&primary_release_date.lte=${lte}&page=${page}`
  )
}

export async function getMovieDetails(id: number) {
  return tmdb(`/movie/${id}?append_to_response=credits,release_dates,videos,images,recommendations,similar`)
}
