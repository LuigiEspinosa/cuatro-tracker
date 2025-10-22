import MovieCard from "@/components/MovieCard";
import Pagination from "@/components/Pagination";
import { getPopular, getTrending, getByReleaseDate } from "@/lib/tmdb";
import Link from "next/link";

export default async function Home({
	searchParams,
}: {
	searchParams: Promise<{ sort?: string; page?: string }>;
}) {
	const sp = await searchParams;
	const sort = sp?.sort || "popular";
	const page = Math.max(1, parseInt(sp?.page || "1", 10));

	const data =
		sort === "trending"
			? await getTrending("day")
			: sort === "release"
			? await getByReleaseDate()
			: await getPopular();

	const movies = (data.results ?? []) as any[];
	const totalPages = Math.min(500, data.total_pages || 1);

	return (
		<div>
			<div className="mb-4 flex gap-2">
				<Link
					className={`px-3 py-2 rounded border ${sort === "popular" ? "bg-black text-white" : ""}`}
					href="/?sort=popular"
				>
					Popular
				</Link>
				<Link
					className={`px-3 py-2 rounded border ${sort === "trending" ? "bg-black text-white" : ""}`}
					href="/?sort=trending"
				>
					Trending
				</Link>
				<Link
					className={`px-3 py-2 rounded border ${sort === "release" ? "bg-black text-white" : ""}`}
					href="/?sort=release"
				>
					Newest
				</Link>
			</div>

			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
				{movies.map((m) => (
					<MovieCard key={m.id} movie={m} />
				))}
			</div>
			<Pagination page={page} totalPages={totalPages} />
		</div>
	);
}
