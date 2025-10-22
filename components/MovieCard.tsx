"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export default function MovieCard({
	movie,
	trackedStatus,
}: {
	movie: any;
	trackedStatus?: string;
}) {
	const [saving, setSaving] = useState<boolean>(false);
	const [status, setStatus] = useState<string | undefined>(trackedStatus);

	async function track(next: "WATCHLIST" | "WATCHING" | "COMPLETED" | "DROPPED") {
		setSaving(true);

		try {
			const res = await fetch("/api/track", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ movie, status: next }),
			});

			if (!res.ok) throw new Error("Save failed");
			setStatus(next);

			toast.success(`Saved as ${status}`);
		} catch (e: any) {
			toast.error(e.message || "Failed to save");
		} finally {
			setSaving(false);
		}
	}

	async function untrack() {
		setSaving(true);

		try {
			const res = await fetch(`/api/track?tmdbId=${movie.id}`, { method: "DELETE" });
			if (!res.ok) throw new Error("Remove failed");

			setStatus(undefined);
			toast.success("Removed from your list");
		} catch (e: any) {
			toast.error(e.message || "Failed to remove");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			className={`rounded-lg bg-white shadow p-3 flex flex-col relative ${
				status ? "ring-2 ring-emerald-500" : ""
			}`}
		>
			{status && (
				<button
					onClick={untrack}
					disabled={saving}
					className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
				>
					{status} • Remove
				</button>
			)}

			<Link href={`/movie/${movie.id}`} className="block">
				{movie.poster_path && (
					<Image
						alt={movie.title}
						src={
							`https://image.tmdb.org/t/p/w500${movie.poster_path}` ||
							`https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
						}
						className="rounded"
						width={500}
						height={750}
					/>
				)}

				<div className="mt-2 font-semibold line-clamp-2">{movie.title}</div>
				<div className="text-sm text-gray-500">{movie.release_date ?? "—"}</div>
			</Link>

			<div className="mt-3 flex flex-wrap gap-2">
				{(["WATCHLIST", "WATCHING", "COMPLETED", "DROPPED"] as const).map((s) => (
					<button
						key={s}
						onClick={() => track(s)}
						disabled={saving}
						className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
					>
						{s}
					</button>
				))}
			</div>
		</div>
	);
}
