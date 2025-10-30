// src/lib/actions/movieComments.ts
"use server";

import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createMovieComment(input: {
  tmdbId: number;
  comment: string;
}) {
  const session = await getServerSession(authConfig);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const text = input.comment.trim();
  if (!text) throw new Error("Comment is required");

  await prisma.movieComment.create({
    data: {
      tmdbId: input.tmdbId,
      userId,
      comment: text,
    },
  });

  revalidatePath(`/movie/${input.tmdbId}`);

  return { ok: true };
}

export async function deleteMovieComment(input: {
  id: string;
  tmdbId: number;
}) {
  const session = await getServerSession(authConfig);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const found = await prisma.movieComment.findUnique({
    where: { id: input.id },
    select: { userId: true },
  });
  if (!found || found.userId !== userId) {
    throw new Error("Not allowed");
  }

  await prisma.movieComment.delete({ where: { id: input.id } });

  revalidatePath(`/movie/${input.tmdbId}`);

  return { ok: true };
}
