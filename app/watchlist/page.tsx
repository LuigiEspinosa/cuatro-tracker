import Pagination from "@/components/Pagination";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import Link from "next/link";

export default async function Watchlist({
	searchParams,
}: {
	searchParams: Promise<{
		status?: string;
		sort?: string;
		dir?: string;
		page?: string;
		pageSize?: string;
	}>;
}) {
	const sp = await searchParams;
	const session = await getServerSession(authConfig);
	if (!session) return <div className="p-6 bg-yellow-50 border rounded">Please sign in…</div>;

	const sort = sp?.sort || "updated";
	const dir = (sp?.dir === "asc" ? "asc" : "desc") as "asc" | "desc";
	const page = Math.max(1, parseInt(sp?.page || "1", 10));
	const pageSize = Math.min(50, Math.max(1, parseInt(sp?.pageSize || "20", 10)));

	const orderBy =
		sort === "release"
			? { movie: { releaseDate: dir } }
			: sort === "popularity"
			? { movie: { popularity: dir } }
			: { updatedAt: dir };
	const where: any = { userId: (session.user as any).id };
	if (sp?.status) where.status = sp.status;

	const [total, items] = await prisma.$transaction([
		prisma.userMovie.count({ where }),
		prisma.userMovie.findMany({
			where,
			include: { movie: true },
			orderBy,
			skip: (page - 1) * pageSize,
			take: pageSize,
		}),
	]);
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	function linkFor(next: Partial<{ status: string; sort: string; dir: string; page: number }>) {
		const p = new URLSearchParams();
		if (sp?.status) p.set("status", sp.status);
		p.set("sort", next.sort ?? sort);
		p.set("dir", next.dir ?? dir);
		p.set("page", String(next.page ?? page));
		return `/watchlist?${p.toString()}`;
	}

	return (
		<div>
			<div className="mb-4 flex flex-wrap gap-2 items-center">
				{["WATCHLIST", "WATCHING", "COMPLETED", "DROPPED"].map((s) => (
					<Link
						key={s}
						className={`px-3 py-2 rounded border ${sp?.status === s ? "bg-black text-white" : ""}`}
						href={`/watchlist?status=${s}`}
					>
						{s}
					</Link>
				))}
				<span className="mx-2" />
				{["updated", "release", "popularity"].map((s) => (
					<Link
						key={s}
						className={`px-3 py-2 rounded border ${sort === s ? "bg-black text-white" : ""}`}
						href={linkFor({ sort: s, page: 1 })}
					>
						{s}
					</Link>
				))}
				<Link
					className="px-3 py-2 rounded border"
					href={linkFor({ dir: dir === "asc" ? "desc" : "asc", page: 1 })}
				>
					{dir === "asc" ? "Asc ↑" : "Desc ↓"}
				</Link>
			</div>

			<ul className="space-y-2">
				{items.map((it: any) => (
					<li key={it.id} className="bg-white p-4 rounded border flex items-center justify-between">
						<div>
							<div className="font-semibold">{it.movie.title}</div>
							<div className="text-sm text-gray-500">
								{it.status} •{" "}
								{it.movie.releaseDate
									? new Date(it.movie.releaseDate).toISOString().slice(0, 10)
									: "—"}
							</div>
						</div>
					</li>
				))}
			</ul>

			<Pagination page={page} totalPages={totalPages} />
		</div>
	);
}
