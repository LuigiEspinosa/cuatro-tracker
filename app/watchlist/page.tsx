import { auth } from "@/lib/auth";

export default async function Watchlist({
	searchParams,
}: {
	searchParams?: { status?: string; sort?: string };
}) {
	const session = await auth();
	if (!session) {
		return <div className="p-6 bg-yellow-50 border rounded">Please sign in to view your list.</div>;
	}

	const url = new URL("/api/me/list", "http://localhost");
	if (searchParams?.status) url.searchParams.set("status", searchParams.status);
	if (searchParams?.sort) url.searchParams.set("sort", searchParams.sort);

	const res = await fetch(url.toString(), { headers: { cookie: "" }, cache: "no-store" });
	const items = await res.json();

	return (
		<div>
			<div className="mb-4 flex flex-wrap gap-2">
				{["WATCHLIST", "WATCHING", "COMPLETED", "DROPPED"].map((s) => (
					<a
						key={s}
						className={`px-3 py-2 rounded border ${
							searchParams?.status === s ? "bg-black text-white" : ""
						}`}
						href={`/watchlist?status=${s}`}
					>
						{s}
					</a>
				))}

				<span className="mx-2" />

				{["updated", "release", "popularity"].map((s) => (
					<a
						key={s}
						className={`px-3 py-2 rounded border ${
							searchParams?.sort === s ? "bg-black text-white" : ""
						}`}
						href={`/watchlist?status=${searchParams?.status || ""}&sort=${s}`}
					>
						{s}
					</a>
				))}
			</div>

			<ul className="space-y-2">
				{items.map((it: any) => (
					<li key={it.id} className="bg-white p-4 rounded border">
						<div className="font-semibold">{it.movie.title}</div>
						<div className="text-sm text-gray-500">
							{it.status} • {it.movie.releaseDate?.slice?.(0, 10) ?? "—"}
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
