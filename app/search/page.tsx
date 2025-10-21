import MovieCard from "@/components/MovieCard";
import { searchMovies } from "@/lib/tmdb";

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
	const sp = await searchParams;
	const q = sp?.q ?? "";
	const data = q ? await searchMovies(q) : { results: [] as any[] };
	const movies = (data.results ?? []) as any[];

	return (
		<div>
			<form className="mb-4 flex gap-2">
				<input
					name="q"
					defaultValue={q}
					placeholder="Search movies"
					className="border rounded px-3 py-2 w-full"
				/>
				<button className="px-3 py-2 rounded bg-black text-white">Search</button>
			</form>

			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
				{movies.map((m) => (
					<MovieCard key={m.id} movie={m} />
				))}
			</div>
		</div>
	);
}
