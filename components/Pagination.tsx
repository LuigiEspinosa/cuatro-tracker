"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
	const router = useRouter();
	const params = useSearchParams();
	const pathname = usePathname();

	function go(p: number) {
		const sp = new URLSearchParams(params.toString());
		sp.set("page", String(p));
		router.push(`${pathname}?${sp}`);
	}

	return (
		<div className="mt-6 flex items-center gap-2">
			<button
				className="px-3 py-1 border rounded"
				disabled={page <= 1}
				onClick={() => go(page - 1)}
			>
				Prev
			</button>

			<span className="text-sm">
				Page {page} / {totalPages}
			</span>

			<button
				className="px-3 py-1 border rounded"
				disabled={page >= totalPages}
				onClick={() => go(page + 1)}
			>
				Next
			</button>
		</div>
	);
}
