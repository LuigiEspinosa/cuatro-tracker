import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { ensureEpisodeCached, type TMDBEpisode } from "@/lib/episodes";
import { getServerSession } from "next-auth";

export const runtime = "nodejs";

const EpisodeSchema = z.object({
	id: z.number(),
	name: z.string(),
	air_date: z.string().nullable().optional(),
	still_path: z.string().nullable().optional(),
	runtime: z.number().nullable().optional(),
	overview: z.string().nullable().optional(),
	production_code: z.string().nullable().optional(),
	episode_number: z.number(),
	season_number: z.number(),
	vote_average: z.number().nullable().optional(),
	vote_count: z.number().nullable().optional(),
});

const Body = z.object({
	tvId: z.number(),
	episode: EpisodeSchema,
	status: z.enum(["WATCHLIST", "WATCHING", "COMPLETED", "DROPPED"]),
});

export async function POST(req: Request) {
	const session = await getServerSession(authConfig);
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = Body.parse(await req.json());
	const episode: TMDBEpisode = {
		id: body.episode.id,
		name: body.episode.name,
		air_date: body.episode.air_date ?? undefined,
		still_path: body.episode.still_path ?? undefined,
		runtime: body.episode.runtime ?? undefined,
		overview: body.episode.overview ?? undefined,
		production_code: body.episode.production_code ?? undefined,
		episode_number: body.episode.episode_number,
		season_number: body.episode.season_number,
		vote_average: body.episode.vote_average ?? undefined,
		vote_count: body.episode.vote_count ?? undefined,
	};

	await ensureEpisodeCached(body.tvId, episode);

	const userId = (session.user as any).id;
	const rec = await prisma.userEpisode.upsert({
		where: { userId_tmdbEpisodeId: { userId, tmdbEpisodeId: body.episode.id } },
		update: {
			status: body.status,
		},
		create: {
			userId,
			tmdbEpisodeId: body.episode.id,
			status: body.status,
		},
		include: { episode: true },
	});

	return Response.json(rec);
}

export async function DELETE(req: Request) {
	const session = await getServerSession(authConfig);
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { searchParams } = new URL(req.url);
	const tmdbEpisodeId = Number(searchParams.get("tmdbEpisodeId"));
	if (!tmdbEpisodeId) {
		return Response.json({ error: "tmdbEpisodeId required" }, { status: 400 });
	}

	const userId = (session.user as any).id;
	await prisma.userEpisode
		.delete({ where: { userId_tmdbEpisodeId: { userId, tmdbEpisodeId } } })
		.catch(() => {});

	return Response.json({ ok: true });
}
