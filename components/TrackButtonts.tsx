"use client";

import { useState } from "react";
import { toast } from "sonner";

export default function TrackerButtons({ movie }: { movie: any }) {
	const [saving, setSaving] = useState<boolean>(false);

	async function track(status: "WATCHLIST" | "WATCHING" | "COMPLETED" | "DROPPED") {
		setSaving(true);

		try {
			const res = await fetch("/api/track", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ movie, status }),
			});

			if (!res.ok) throw new Error("Save failed");

			toast.success(`Saved as ${status}`);
		} catch (e: any) {
			toast.error(e.message || "Failed to save");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="mt-4 flex flex-wrap gap-2">
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
