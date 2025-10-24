import TrackerButtons from "@/components/TrackButtonts";
import { authConfig } from "@/lib/auth";
import { getMovieDetails } from "@/lib/tmdb";
import { getServerSession } from "next-auth";
import Image from "next/image";

export default async function MovieDetails({ params }: { params: Promise<{ id: string }> }) {
	const session = await getServerSession(authConfig);

	const { id } = await params;
	const data = await getMovieDetails(Number(id));

	const poster = data.poster_path
		? `https://image.tmdb.org/t/p/w500${data.poster_path}`
		: undefined;

	const backdrop = data.backdrop_path
		? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
		: undefined;

	const release = data.release_date ?? "—";
	const runtime = data.runtime ? `${data.runtime} min` : "—";
	const genres = (data.genres || []).map((g: any) => g.name).join(", ");
	const cast = (data.credits?.cast || []).slice(0, 8);
	const videos = (data.videos?.results || []).filter((v: any) => v.site === "YouTube");

	return (
		<div className="space-y-6">
			{backdrop && (
				<div className="relative w-full h-64 md:h-80 rounded overflow-hidden">
					<Image src={backdrop} alt={data.title} fill className="object-cover" priority />
				</div>
			)}

			<div className="flex gap-4">
				{poster && (
					<div className="relative w-40 h-60 shrink-0 rounded overflow-hidden">
						<Image src={poster} alt={data.title} fill className="object-cover" />
					</div>
				)}

				<div className="space-y-2">
					<h1 className="text-2xl font-semibold">{data.title}</h1>
					<div className="text-sm text-gray-600">
						Release: {release} • Runtime: {runtime}
					</div>
					<div className="text-sm text-gray-600">Genres: {genres || "—"}</div>
					{data.tagline && <div className="italic text-gray-700">{data.tagline}</div>}
					{data.overview && <p className="text-gray-800">{data.overview}</p>}

					{session?.user && <TrackerButtons movie={data} />}
				</div>
			</div>

			{cast.length > 0 && (
				<div>
					<h2 className="font-semibold mb-2">Top Cast</h2>
					<ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
						{cast.map((c: any) => (
							<li key={c.cast_id} className="bg-white border rounded p-3">
								<div className="font-medium">{c.name}</div>
								<div className="text-xs text-gray-600">as {c.character}</div>
							</li>
						))}
					</ul>
				</div>
			)}

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
