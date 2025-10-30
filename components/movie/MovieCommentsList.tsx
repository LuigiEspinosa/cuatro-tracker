// components/movie/MovieCommentsList.tsx
"use client";

import { useTransition } from "react";
import { deleteMovieComment } from "@/lib/actions/movieComments";

export function MovieCommentsList({
	me,
	comments,
}: {
	me: string | null;
	comments: Array<{
		id: string;
		userId: string;
		tmdbId: number;
		comment: string;
		createdAt: string | Date;
		user?: { name: string | null; email: string | null; image: string | null } | null;
		userMovie?: { rating: number | null } | null;
	}>;
}) {
	const [isPending, startTransition] = useTransition();

	return (
		<section className="rounded-2xl border p-4 space-y-3">
			<h2 className="text-base font-semibold">Comments ({comments.length})</h2>
			{!comments.length ? (
				<p className="text-sm opacity-70">No comments yet.</p>
			) : (
				<ul className="flex flex-col gap-3">
					{comments.map((c) => {
						const isMe = c.userId === me;
						const date = typeof c.createdAt === "string" ? new Date(c.createdAt) : c.createdAt;
						const name =
							c.user?.name || c.user?.email?.split("@")[0] || (isMe ? "You" : "Anonymous");
						const rating = c.userMovie?.rating ?? null;

						return (
							<li
								key={c.id}
								className={`rounded-2xl border p-3 ${
									isMe ? "bg-blue-50/80 dark:bg-blue-950/10" : ""
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<div>
										<p className="text-sm font-medium">{name}</p>
										<p className="text-xs opacity-50">{date.toLocaleString()}</p>
									</div>

									{isMe && (
										<button
											disabled={isPending}
											onClick={() =>
												startTransition(async () => {
													await deleteMovieComment({ id: c.id, tmdbId: c.tmdbId });
												})
											}
											className="text-xs text-red-600 underline underline-offset-2 disabled:opacity-50 dark:text-red-400"
										>
											Remove
										</button>
									)}
								</div>

								{/* ⭐️ User rating */}
								{rating != null && (
									<p
										className="mt-1 text-sm text-yellow-500"
										aria-label={`Rating: ${rating} stars`}
									>
										{Array.from({ length: 5 }).map((_, i) => (
											<span key={i}>{i < rating ? "★" : "☆"}</span>
										))}
									</p>
								)}

								<p className="mt-2 whitespace-pre-wrap text-sm">{c.comment}</p>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
