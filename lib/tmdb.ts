const TMDB_BASE = 'https://api.themoviedb.org/3'
const key = process.env.TMDB_API_KEY!

export type TMDBMovie = {
  id: number,
  title: string,
  release_date?: string,
  poster_path?: string,
  background_path?: string,
  popularity?: number
}

async function tmdb(path: string, init?: RequestInit) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('api_key', key);
  url.searchParams.set('langauge', 'en-Us');

  const res = await fetch(url, { ...init, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);

  return res.json();
}

export async function getPopular(page = 1) {
  return tmdb(`/movie/popular?page=${page}`)
}

export async function getTrending(time_window: 'day' | 'week' = 'day') {
  return tmdb(`/trending/movie/${time_window}`)
}

export async function searchMovies(q: string, page = 1) {
  return tmdb(`/search/movie?query=${encodeURIComponent(q)}&page=${page}`)
}

export async function getByReleaseDate(page = 1) {
  return tmdb(`/discover/movie?sort_by=primary_release_date.desc&page=${page}`)
}
