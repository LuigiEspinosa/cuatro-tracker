// src/lib/actions/userMovie.ts
"use server";

import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function upsertUserMovieRating(input: {
  tmdbId: number;
  rating: number | null; // 0..5 or null
}) {
  const session = await getServerSession(authConfig);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  if (input.rating != null) {
    if (!Number.isInteger(input.rating) || input.rating < 0 || input.rating > 5) {
      throw new Error("Rating must be between 0 and 5");
    }
  }

  await prisma.userMovie.upsert({
    where: { userId_tmdbId: { userId, tmdbId: input.tmdbId } },
    create: {
      userId,
      tmdbId: input.tmdbId,
      status: "WATCHLIST",
      rating: input.rating,
    },
    update: {
      rating: input.rating,
    },
  });

  revalidatePath(`/movie/${input.tmdbId}`);

  return { ok: true };
}
