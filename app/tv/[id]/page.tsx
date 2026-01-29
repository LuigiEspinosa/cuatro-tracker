import EpisodeTrackButtons from "@/components/EpisodeTrackButtons";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTvDetails, getTvSeasonDetails } from "@/lib/tmdb";
import { getServerSession } from "next-auth";
import Image from "next/image";

export default async function TvDetails({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const tmdbId = Number(id);
	const session = await getServerSession(authConfig);
	const data = await getTvDetails(tmdbId);

	const poster = data.poster_path
		? `https://image.tmdb.org/t/p/w500${data.poster_path}`
		: undefined;

	const backdrop = data.backdrop_path
		? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
		: undefined;

	const firstAir = data.first_air_date ?? "—";
	const seasons = data.number_of_seasons ?? "—";
	const episodes = data.number_of_episodes ?? "—";
	const runtime = Array.isArray(data.episode_run_time) && data.episode_run_time.length > 0
		? `${data.episode_run_time[0]} min`
		: "—";
	const genres = (data.genres || []).map((g: any) => g.name).join(", ");
	const cast = (data.credits?.cast || []).slice(0, 8);
	const videos = (data.videos?.results || []).filter((v: any) => v.site === "YouTube");
	const createdBy = (data.created_by || []).map((c: any) => c.name).join(", ");
	const networks = (data.networks || []).map((n: any) => n.name).join(", ");
	const companies = (data.production_companies || []).map((c: any) => c.name).join(", ");
	const countries = (data.production_countries || []).map((c: any) => c.name).join(", ");
	const spoken = (data.spoken_languages || []).map((l: any) => l.english_name || l.name).join(", ");
	const origins = (data.origin_country || []).join(", ");
	const languages = (data.languages || []).join(", ");
	const keywords = (data.keywords?.results || []).map((k: any) => k.name).join(", ");
	const contentRatings = (data.content_ratings?.results || [])
		.map((r: any) => `${r.iso_3166_1}: ${r.rating}`)
		.join(", ");
	const externalIds = data.external_ids
		? Object.entries(data.external_ids)
				.filter(([, v]) => v)
				.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
				.join(", ")
		: "";
	const lastEpisode = data.last_episode_to_air;
	const nextEpisode = data.next_episode_to_air;

	const seasonList = Array.isArray(data.seasons) ? data.seasons : [];
	const seasonsWithNumber = seasonList.filter(
		(s: any) => typeof s.season_number === "number"
	);
	const seasonDetails = await Promise.all(
		seasonsWithNumber.map(async (s: any) => ({
			season: s,
			details: await getTvSeasonDetails(tmdbId, s.season_number),
		}))
	);

	let tracked = new Map<number, string>();
	if (session?.user) {
		const episodeIds = new Set<number>();
		seasonDetails.forEach(({ details }: any) => {
			(details.episodes || []).forEach((ep: any) => {
				if (typeof ep.id === "number") episodeIds.add(ep.id);
			});
		});

		const ids = Array.from(episodeIds);
		if (ids.length > 0) {
			const userId = (session.user as any).id;
			const userEpisodeModel = (prisma as any).userEpisode;
			if (userEpisodeModel?.findMany) {
				const rows = await userEpisodeModel.findMany({
					where: { userId, tmdbEpisodeId: { in: ids } },
					select: { tmdbEpisodeId: true, status: true },
				});

				tracked = new Map(rows.map((r: any) => [r.tmdbEpisodeId, r.status]));
			}
		}
	}

	return (
		<div className="space-y-6">
			{backdrop && (
				<div className="relative w-full h-64 md:h-80 rounded overflow-hidden">
					<Image src={backdrop} alt={data.name} fill className="object-cover" priority />
				</div>
			)}

			<div className="flex gap-4">
				{poster && (
					<div className="relative w-40 h-60 shrink-0 rounded overflow-hidden">
						<Image src={poster} alt={data.name} fill className="object-cover" />
					</div>
				)}

				<div className="space-y-2">
					<h1 className="text-2xl font-semibold">{data.name}</h1>
					<div className="text-sm text-gray-600">
						First Air: {firstAir} • Runtime: {runtime}
					</div>
					<div className="text-sm text-gray-600">
						Seasons: {seasons} • Episodes: {episodes}
					</div>
					<div className="text-sm text-gray-600">Genres: {genres || "—"}</div>
					{data.tagline && <div className="italic text-gray-700">{data.tagline}</div>}
					{data.overview && <p className="text-gray-800">{data.overview}</p>}
				</div>
			</div>

			<div>
				<h2 className="font-semibold mb-2">Series Metadata</h2>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Original Name</div>
						<div>{data.original_name || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Original Language</div>
						<div>{data.original_language || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Status</div>
						<div>{data.status || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Type</div>
						<div>{data.type || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">In Production</div>
						<div>{typeof data.in_production === "boolean" ? String(data.in_production) : "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">First Air Date</div>
						<div>{data.first_air_date || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Last Air Date</div>
						<div>{data.last_air_date || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Seasons</div>
						<div>{data.number_of_seasons ?? "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Episodes</div>
						<div>{data.number_of_episodes ?? "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Episode Run Times</div>
						<div>
							{Array.isArray(data.episode_run_time) && data.episode_run_time.length > 0
								? data.episode_run_time.map((t: any) => `${t} min`).join(", ")
								: "—"}
						</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Created By</div>
						<div>{createdBy || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Networks</div>
						<div>{networks || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Production Companies</div>
						<div>{companies || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Production Countries</div>
						<div>{countries || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Spoken Languages</div>
						<div>{spoken || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Origin Countries</div>
						<div>{origins || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Languages</div>
						<div>{languages || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Popularity</div>
						<div>{typeof data.popularity === "number" ? data.popularity.toFixed(2) : "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Votes</div>
						<div>
							{typeof data.vote_average === "number"
								? `${data.vote_average.toFixed(1)} (${data.vote_count ?? 0})`
								: "—"}
						</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Content Ratings</div>
						<div>{contentRatings || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">Keywords</div>
						<div>{keywords || "—"}</div>
					</div>
					<div className="bg-white border rounded p-3">
						<div className="text-xs text-gray-500">External IDs</div>
						<div className="break-words">{externalIds || "—"}</div>
					</div>
					{data.homepage && (
						<div className="bg-white border rounded p-3">
							<div className="text-xs text-gray-500">Homepage</div>
							<div className="break-words">{data.homepage}</div>
						</div>
					)}
					{lastEpisode && (
						<div className="bg-white border rounded p-3">
							<div className="text-xs text-gray-500">Last Episode to Air</div>
							<div>
								{lastEpisode.name} (S{lastEpisode.season_number}E{lastEpisode.episode_number}) •{" "}
								{lastEpisode.air_date || "—"}
							</div>
						</div>
					)}
					{nextEpisode && (
						<div className="bg-white border rounded p-3">
							<div className="text-xs text-gray-500">Next Episode to Air</div>
							<div>
								{nextEpisode.name} (S{nextEpisode.season_number}E{nextEpisode.episode_number}) •{" "}
								{nextEpisode.air_date || "—"}
							</div>
						</div>
					)}
				</div>
			</div>

			{cast.length > 0 && (
				<div>
					<h2 className="font-semibold mb-2">Top Cast</h2>
					<ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
						{cast.map((c: any) => (
							<li key={c.cast_id ?? c.id} className="bg-white border rounded p-3">
								<div className="font-medium">{c.name}</div>
								<div className="text-xs text-gray-600">as {c.character}</div>
							</li>
						))}
					</ul>
				</div>
			)}

			<div>
				<h2 className="font-semibold mb-2">Episodes</h2>
				<div className="space-y-6">
					{seasonDetails.map(({ season, details }: any) => (
						<div key={season.season_number} className="bg-white border rounded p-4 space-y-4">
							<div className="flex flex-col md:flex-row gap-4">
								{details.poster_path && (
									<div className="relative w-28 h-40 shrink-0 rounded overflow-hidden">
										<Image
											src={`https://image.tmdb.org/t/p/w500${details.poster_path}`}
											alt={details.name}
											fill
											className="object-cover"
										/>
									</div>
								)}
								<div className="space-y-1">
									<h3 className="text-lg font-semibold">
										{details.name || season.name || `Season ${season.season_number}`}
									</h3>
									<div className="text-sm text-gray-600">
										Air Date: {details.air_date || "—"} • Episodes:{" "}
										{details.episodes?.length ?? season.episode_count ?? "—"}
									</div>
									{details.overview && <p className="text-sm text-gray-700">{details.overview}</p>}
								</div>
							</div>

							<div className="space-y-4">
								{(details.episodes || []).map((ep: any) => (
									<div key={ep.id} className="border rounded p-3">
										<div className="flex flex-col md:flex-row gap-4">
											{ep.still_path && (
												<div className="relative w-full md:w-56 h-32 rounded overflow-hidden">
													<Image
														src={`https://image.tmdb.org/t/p/w500${ep.still_path}`}
														alt={ep.name}
														fill
														className="object-cover"
													/>
												</div>
											)}
											<div className="space-y-2 w-full">
												<div className="font-semibold">
													S{ep.season_number}E{ep.episode_number} • {ep.name}
												</div>
												<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-gray-600">
													<div>
														<span className="font-medium">Air Date:</span> {ep.air_date || "—"}
													</div>
													<div>
														<span className="font-medium">Runtime:</span>{" "}
														{typeof ep.runtime === "number" ? `${ep.runtime} min` : "—"}
													</div>
													<div>
														<span className="font-medium">Vote:</span>{" "}
														{typeof ep.vote_average === "number"
															? `${ep.vote_average.toFixed(1)} (${ep.vote_count ?? 0})`
															: "—"}
													</div>
													<div>
														<span className="font-medium">Production Code:</span>{" "}
														{ep.production_code || "—"}
													</div>
													<div>
														<span className="font-medium">Episode Type:</span>{" "}
														{ep.episode_type || "—"}
													</div>
													<div>
														<span className="font-medium">ID:</span> {ep.id ?? "—"}
													</div>
												</div>
												{ep.overview && <p className="text-sm text-gray-700">{ep.overview}</p>}
												{(ep.crew || []).length > 0 && (
													<div className="text-xs text-gray-600">
														<span className="font-medium">Crew:</span>{" "}
														{ep.crew
															.map((c: any) => `${c.name}${c.job ? ` (${c.job})` : ""}`)
															.join(", ")}
													</div>
												)}
												{(ep.guest_stars || []).length > 0 && (
													<div className="text-xs text-gray-600">
														<span className="font-medium">Guest Stars:</span>{" "}
														{ep.guest_stars
															.map((g: any) =>
																`${g.name}${g.character ? ` as ${g.character}` : ""}`
															)
															.join(", ")}
													</div>
												)}
												{session?.user && (
													<div className="pt-2">
														<EpisodeTrackButtons
															tvId={tmdbId}
															episode={ep}
															trackedStatus={tracked.get(ep.id)}
														/>
													</div>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</div>

			{videos.length > 0 && (
				<div>
					<h2 className="font-semibold mb-2">Videos</h2>
					<ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{videos.slice(0, 4).map((v: any) => (
							<li key={v.id} className="aspect-video">
								<iframe
									className="w-full h-full rounded border"
									src={`https://www.youtube.com/embed/${v.key}`}
									title={v.name}
									allowFullScreen
								/>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
