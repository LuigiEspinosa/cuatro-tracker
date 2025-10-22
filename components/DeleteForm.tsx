"use client";

export default function DeleteForm({ item }: { item: any }) {
	return (
		<form
			action={`/api/track?tmdbId=${item.tmdbId}`}
			method="post"
			onSubmit={(e) => {
				e.preventDefault();
				fetch(`/api/track?tmdbId=${item.tmdbId}`, { method: "DELETE" }).then(() =>
					location.reload()
				);
			}}
		>
			<button className="px-3 py-2 rounded border">Remove</button>
		</form>
	);
}
