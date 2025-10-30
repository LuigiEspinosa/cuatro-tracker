import MovieCard from "@/components/MovieCard";
import Pagination from "@/components/Pagination";
import SearchBox from "@/components/SearchBox";
import { searchMovies } from "@/lib/tmdb";

export default async function Search({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; page?: string }>;
}) {
	const sp = await searchParams;
	const q = sp?.q || "";
	const page = Math.max(1, parseInt(sp?.page || "1", 10));
	const data = q ? await searchMovies(q, page) : { results: [], total_pages: 1 };
	const movies = data.results as any[];
	const totalPages = Math.min(500, data.total_pages || 1);

	return (
		<div>
			<SearchBox />

			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
				{movies.map((m) => (
					<MovieCard key={m.id} movie={m} />
				))}
			</div>
			{q && <Pagination page={page} totalPages={totalPages} />}
		</div>
	);
}
