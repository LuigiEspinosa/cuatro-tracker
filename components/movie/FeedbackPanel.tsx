// components/movie/FeedbackPanel.tsx
"use client";

import { useState, useTransition } from "react";
import { upsertUserMovieRating } from "@/lib/actions/userMovie";

export function FeedbackPanel({
	tmdbId,
	initialRating,
}: {
	tmdbId: number;
	initialRating: number | null;
}) {
	const [rating, setRating] = useState<number | null>(initialRating);
	const [hover, setHover] = useState<number | null>(null);
	const [isPending, startTransition] = useTransition();

	const current = hover ?? rating ?? 0;

	const setServerRating = (r: number | null) => {
		setRating(r);
		startTransition(async () => {
			await upsertUserMovieRating({ tmdbId, rating: r });
		});
	};

	return (
		<section className="rounded-2xl border p-4">
			<h2 className="text-base font-semibold mb-2">Your rating</h2>
			<div className="flex items-center gap-1">
				{Array.from({ length: 5 }).map((_, i) => {
					const star = i + 1;
					const filled = star <= current;
					return (
						<button
							key={star}
							type="button"
							onMouseEnter={() => setHover(star)}
							onMouseLeave={() => setHover(null)}
							onClick={() => setServerRating(star)}
							className="text-2xl leading-none"
							aria-label={`${star} star${star === 1 ? "" : "s"}`}
						>
							{filled ? "★" : "☆"}
						</button>
					);
				})}
				<button
					onClick={() => setServerRating(null)}
					disabled={isPending}
					className="ml-2 text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
				>
					Clear
				</button>
			</div>
		</section>
	);
}
