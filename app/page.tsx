import MovieCard from "@/components/MovieCard";
import { getPopular, getTrending, getByReleaseDate } from "@/lib/tmdb";

export default async function Home({ searchParams }: { searchParams?: { sort?: string } }) {
	const sort = searchParams?.sort || "popular";

	const data =
		sort === "trending"
			? await getTrending("day")
			: sort === "release"
			? await getByReleaseDate()
			: await getPopular();

	const movies = data.results as any[];

	return (
		<div>
			<div className="mb-4 flex gap-2">
				<a
					className={`px-3 py-2 rounded border ${sort === "popular" ? "bg-black text-white" : ""}`}
					href="/?sort=popular"
				>
					Popular
				</a>
				<a
					className={`px-3 py-2 rounded border ${sort === "trending" ? "bg-black text-white" : ""}`}
					href="/?sort=trending"
				>
					Trending
				</a>
				<a
					className={`px-3 py-2 rounded border ${sort === "release" ? "bg-black text-white" : ""}`}
					href="/?sort=release"
				>
					Newest
				</a>
			</div>

			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
				{movies.map((m) => (
					<MovieCard key={m.id} movie={m} />
				))}
			</div>
		</div>
	);
}
