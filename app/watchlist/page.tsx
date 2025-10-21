import { authConfig } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import Link from "next/link";

export default async function Watchlist({
	searchParams,
}: {
	searchParams: Promise<{ status?: string; sort?: string }>;
}) {
	const sp = await searchParams;
	const session = await getServerSession(authConfig);
	if (!session) return <div className="p-6 bg-yellow-50 border rounded">Please sign in…</div>;

	const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
	const h = new Headers();
	const cookie = (await headers()).get("cookie");
	if (cookie) h.set("cookie", cookie);

	const qs = new URLSearchParams();
	if (sp?.status) qs.set("status", sp.status);
	if (sp?.sort) qs.set("sort", sp.sort);

	const res = await fetch(`${base}/api/me/list?${qs}`, { headers: h, cache: "no-store" });
	if (!res.ok) throw new Error(`/api/me/list ${res.status}`);
	const items = await res.json();

	return (
		<div>
			<div className="mb-4 flex flex-wrap gap-2">
				{["WATCHLIST", "WATCHING", "COMPLETED", "DROPPED"].map((s) => (
					<Link
						key={s}
						className={`px-3 py-2 rounded border ${sp?.status === s ? "bg-black text-white" : ""}`}
						href={`/watchlist?status=${s}${sp?.sort ? `&sort=${sp.sort}` : ""}`}
					>
						{s}
					</Link>
				))}

				<span className="mx-2" />

				{["updated", "release", "popularity"].map((s) => (
					<Link
						key={s}
						className={`px-3 py-2 rounded border ${sp?.sort === s ? "bg-black text-white" : ""}`}
						href={`/watchlist?${sp?.status ? `status=${sp.status}&` : ""}sort=${s}`}
					>
						{s}
					</Link>
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
