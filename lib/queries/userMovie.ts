// src/lib/queries/userMovie.ts
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getMyUserMovie(tmdbId: number) {
  const session = await getServerSession(authConfig);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;

  return prisma.userMovie.findUnique({
    where: { userId_tmdbId: { userId, tmdbId } },
    select: { rating: true },
  });
}
