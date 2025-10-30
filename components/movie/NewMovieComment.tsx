// components/movie/NewMovieComment.tsx
"use client";

import { useState, useTransition } from "react";
import { createMovieComment } from "@/lib/actions/movieComments";

export function NewMovieComment({ tmdbId, canComment }: { tmdbId: number; canComment: boolean }) {
	const [text, setText] = useState("");
	const [isPending, startTransition] = useTransition();

	if (!canComment) {
		return <p className="rounded-2xl border p-4 text-sm opacity-70">Sign in to leave a comment.</p>;
	}

	return (
		<section className="rounded-2xl border p-4">
			<h2 className="text-base font-semibold mb-2">Add a comment</h2>
			<textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				rows={3}
				className="w-full rounded-xl border p-2 outline-none"
				placeholder="What did you think?"
			/>
			<div className="mt-2">
				<button
					onClick={() =>
						startTransition(async () => {
							await createMovieComment({ tmdbId, comment: text });
							setText(""); // clear after post
						})
					}
					disabled={isPending || !text.trim()}
					className="rounded-full bg-black px-4 py-1 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
				>
					Post
				</button>
			</div>
		</section>
	);
}
