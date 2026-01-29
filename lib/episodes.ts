import { prisma } from "./prisma";

export type TMDBEpisode = {
	id: number;
	name: string;
	air_date?: string | null;
	still_path?: string | null;
	runtime?: number | null;
	overview?: string | null;
	production_code?: string | null;
	episode_number: number;
	season_number: number;
	vote_average?: number | null;
	vote_count?: number | null;
};

export async function ensureEpisodeCached(tvId: number, ep: TMDBEpisode) {
	return prisma.episode.upsert({
		where: { tmdbId: ep.id },
		update: {
			tvId,
			seasonNumber: ep.season_number,
			episodeNumber: ep.episode_number,
			name: ep.name,
			airDate: ep.air_date ? new Date(ep.air_date) : null,
			stillPath: ep.still_path ?? null,
			runtime: ep.runtime ?? null,
			overview: ep.overview ?? null,
			productionCode: ep.production_code ?? null,
			voteAverage: ep.vote_average ?? null,
			voteCount: ep.vote_count ?? null,
		},
		create: {
			tmdbId: ep.id,
			tvId,
			seasonNumber: ep.season_number,
			episodeNumber: ep.episode_number,
			name: ep.name,
			airDate: ep.air_date ? new Date(ep.air_date) : null,
			stillPath: ep.still_path ?? null,
			runtime: ep.runtime ?? null,
			overview: ep.overview ?? null,
			productionCode: ep.production_code ?? null,
			voteAverage: ep.vote_average ?? null,
			voteCount: ep.vote_count ?? null,
		},
	});
}
