"use client";

import Image from "next/image";
import Link from "next/link";

export default function TvCard({ tv }: { tv: any }) {
	return (
		<div className="rounded-lg bg-white shadow p-3 flex flex-col relative">
			<Link href={`/tv/${tv.id}`} className="block">
				{tv.poster_path && (
					<Image
						alt={tv.name}
						src={
							`https://image.tmdb.org/t/p/w500${tv.poster_path}` ||
							`https://image.tmdb.org/t/p/w1280${tv.backdrop_path}`
						}
						className="rounded"
						width={500}
						height={750}
					/>
				)}

				<div className="mt-2 font-semibold line-clamp-2">{tv.name}</div>
				<div className="text-sm text-gray-500">{tv.first_air_date ?? "—"}</div>
			</Link>
		</div>
	);
}
