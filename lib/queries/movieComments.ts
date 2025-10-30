// src/lib/queries/movieComments.ts
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getMovieComments(tmdbId: number) {
  const session = await getServerSession(authConfig);
  const me = (session?.user as any)?.id ?? null;

  const comments = await prisma.movieComment.findMany({
    where: { tmdbId },
    include: {
      user: {
        select: { name: true, email: true, image: true },
      },
      userMovie: {
        select: { rating: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return { me, comments };
}
