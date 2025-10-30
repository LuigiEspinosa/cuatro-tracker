"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function SearchBox({ placeholder = "Search movies…" }: { placeholder?: string }) {
	const [q, setQ] = useState("");
	const [open, setOpen] = useState(false);
	const [items, setItems] = useState<
		Array<{ id: number; title: string; year?: string; poster?: string | null }>
	>([]);
	const [highlight, setHighlight] = useState<number>(-1);
	const abortRef = useRef<AbortController | null>(null);
	const router = useRouter();

	const fetchSuggest = useCallback(async (query: string) => {
		// cancel previous
		if (abortRef.current) {
			abortRef.current.abort();
		}

		const ac = new AbortController();
		abortRef.current = ac;

		try {
			const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
				signal: ac.signal,
			});

			if (!res.ok) return;

			const data = await res.json();
			setItems(data.results ?? []);
			setOpen(true);
			setHighlight(-1);
		} catch (err: any) {
			// ignore abort errors – they're expected
			if (err.name === "AbortError") {
				return;
			}
			// you can console.error others if you want
			// console.error(err);
		}
	}, []);

	// debounce
	useEffect(() => {
		if (!q.trim()) {
			setOpen(false);
			setItems([]);
			return;
		}

		const t = setTimeout(() => {
			fetchSuggest(q.trim());
		}, 180);

		return () => clearTimeout(t);
	}, [q, fetchSuggest]);

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlight((h) => Math.min(h + 1, items.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlight((h) => Math.max(h - 1, 0));
		} else if (e.key === "Enter") {
			if (highlight >= 0 && items[highlight]) {
				router.push(`/movie/${items[highlight].id}`);
			} else if (q.trim()) {
				router.push(`/search?q=${encodeURIComponent(q.trim())}`);
			}
			setOpen(false);
		} else if (e.key === "Escape") {
			setOpen(false);
		}
	};

	return (
		<div className="relative w-full">
			<input
				value={q}
				onChange={(e) => setQ(e.target.value)}
				onFocus={() => {
					if (items.length) setOpen(true);
				}}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				className="w-full rounded-2xl border px-4 py-2 outline-none"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls="search-suggest-list"
				role="combobox"
			/>

			{open && items.length > 0 && (
				<ul
					id="search-suggest-list"
					role="listbox"
					className="absolute z-50 mt-2 max-h-80 w-full overflow-auto rounded-2xl border bg-white p-1 shadow-xl"
				>
					{items.map((it, idx) => (
						<li
							key={it.id}
							role="option"
							aria-selected={idx === highlight}
							className={`flex cursor-pointer items-center gap-3 rounded-xl p-2 ${
								idx === highlight ? "bg-black/4" : ""
							}`}
							onMouseEnter={() => setHighlight(idx)}
							onMouseDown={(e) => {
								e.preventDefault();
							}}
							onClick={() => {
								setOpen(false);
								router.push(`/movie/${it.id}`);
							}}
						>
							{it.poster ? (
								<Image
									src={it.poster}
									alt={`${it.title} Poster`}
									className="h-10 w-7 rounded-md object-cover"
									width={92}
									height={129}
								/>
							) : (
								<div className="h-10 w-7 rounded-md bg-black//4" />
							)}
							<div className="min-w-0">
								<div className="truncate text-sm font-medium">{it.title}</div>
								<div className="truncate text-xs opacity-60">{it.year || ""}</div>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
