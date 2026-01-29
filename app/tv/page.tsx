import Pagination from "@/components/Pagination";
import TvCard from "@/components/TvCard";
import { getPopularTv, getTrendingTv, getByFirstAirDate } from "@/lib/tmdb";
import Link from "next/link";

export default async function TvHome({
	searchParams,
}: {
	searchParams: Promise<{ sort?: string; dir?: string; page?: string }>;
}) {
	const sp = await searchParams;
	const sort = sp?.sort || "popular";
	const dir = (sp?.dir === "asc" ? "asc" : "desc") as "asc" | "desc";
	const page = Math.max(1, parseInt(sp?.page || "1", 10));

	const data =
		sort === "trending"
			? await getTrendingTv("day", page)
			: sort === "release"
			? await getByFirstAirDate(page, dir)
			: await getPopularTv(page, dir);

	const shows = (data.results ?? []) as any[];
	const totalPages = data.total_pages || 1;

	function linkFor(next: Partial<{ sort: string; dir: "asc" | "desc"; page: number }>) {
		const p = new URLSearchParams();
		p.set("sort", next.sort ?? sort);
		p.set("dir", next.dir ?? dir);
		p.set("page", String(next.page ?? page));

		return `/tv?${p.toString()}`;
	}

	const newOld = dir === "asc" ? "Oldest" : "Newest";

	return (
		<div>
			<div className="mb-4 flex gap-2 items-center">
				{["popular", "trending", "release"].map((s) => (
					<Link
						key={s}
						className={`px-3 py-2 rounded border ${sort === s ? "bg-black text-white" : ""}`}
						href={linkFor({ sort: s, page: 1 })}
					>
						{s === "release" ? newOld : s.charAt(0).toUpperCase() + s.slice(1)}
					</Link>
				))}

				<Link
					className="px-3 py-2 rounded border"
					href={linkFor({ dir: dir === "asc" ? "desc" : "asc", page: 1 })}
				>
					{dir === "asc" ? "Asc ↑" : "Desc ↓"}
				</Link>
			</div>

			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
				{shows.map((tv) => (
					<TvCard key={tv.id} tv={tv} />
				))}
			</div>

			<Pagination page={page} totalPages={totalPages} />
		</div>
	);
}
