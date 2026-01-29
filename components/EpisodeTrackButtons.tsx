"use client";

import { useState } from "react";
import { toast } from "sonner";

export default function EpisodeTrackButtons({
	tvId,
	episode,
	trackedStatus,
}: {
	tvId: number;
	episode: any;
	trackedStatus?: string;
}) {
	const [saving, setSaving] = useState<boolean>(false);
	const [status, setStatus] = useState<string | undefined>(trackedStatus);

	async function track(next: "WATCHLIST" | "WATCHING" | "COMPLETED" | "DROPPED") {
		setSaving(true);

		const episodePayload = {
			id: episode.id,
			name: episode.name,
			air_date: episode.air_date ?? null,
			still_path: episode.still_path ?? null,
			runtime: episode.runtime ?? null,
			overview: episode.overview ?? null,
			production_code: episode.production_code ?? null,
			episode_number: episode.episode_number,
			season_number: episode.season_number,
			vote_average: episode.vote_average ?? null,
			vote_count: episode.vote_count ?? null,
		};

		try {
			const res = await fetch("/api/track-episode", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tvId, episode: episodePayload, status: next }),
			});

			if (!res.ok) throw new Error("Save failed");
			setStatus(next);
			toast.success(`Saved as ${next}`);
		} catch (e: any) {
			toast.error(e.message || "Failed to save");
		} finally {
			setSaving(false);
		}
	}

	async function untrack() {
		setSaving(true);

		try {
			const res = await fetch(`/api/track-episode?tmdbEpisodeId=${episode.id}`, {
				method: "DELETE",
			});
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
		<div className="flex flex-wrap items-center gap-2">
			{status && (
				<button
					onClick={untrack}
					disabled={saving}
					className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
				>
					{status} • Remove
				</button>
			)}

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
	);
}
