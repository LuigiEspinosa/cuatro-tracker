import MovieCard from "@/components/MovieCard";
import Pagination from "@/components/Pagination";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPopular, getTrending, getByRelease } from "@/lib/tmdb";
import { getServerSession } from "next-auth";
import Link from "next/link";

export default async function Home({
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
			? await getTrending("day", page)
			: sort === "release"
			? await getByRelease(page, dir)
			: await getPopular(page, dir);

	const movies = (data.results ?? []) as any[];
	const totalPages = data.total_pages || 1;

	const session = await getServerSession(authConfig);

	let tracked = new Map<number, string>();
	if (session?.user) {
		const rows = await prisma.userMovie.findMany({
			where: { userId: (session.user as any).id },
			select: { tmdbId: true, status: true },
		});

		tracked = new Map(rows.map((r) => [r.tmdbId, r.status]));
	}

	function linkFor(next: Partial<{ sort: string; dir: "asc" | "desc"; page: number }>) {
		const p = new URLSearchParams();
		p.set("sort", next.sort ?? sort);
		p.set("dir", next.dir ?? dir);
		p.set("page", String(next.page ?? page));

		return `/?${p.toString()}`;
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
				{movies.map((m) => (
					<MovieCard key={m.id} movie={m} trackedStatus={tracked.get(m.id)} />
				))}
			</div>

			<Pagination page={page} totalPages={totalPages} />
		</div>
	);
}
