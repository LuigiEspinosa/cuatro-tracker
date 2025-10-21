"use client";

import Image from "next/image";
import { useState } from "react";

export default function MovieCard({ movie }: { movie: any }) {
	const [saving, setSaving] = useState(false);

	async function track(status: "WATCHLIST" | "WATCHING" | "COMPLETED" | "DROPPED") {
		setSaving(true);
		try {
			await fetch("/api/track", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ movie, status }),
			});

			alert(`Saved as ${status}`);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="rounded-lg bg-white shadow p-3 flex flex-col">
			{movie.poster_path && (
				<Image
					alt={movie.title}
					src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
					className="rounded"
					width={245}
					height={365}
					priority
				/>
			)}

			<div className="mt-2 font-semibold line-clamp-2">{movie.title}</div>
			<div className="text-sm text-gray-500">{movie.release_date ?? "—"}</div>

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
