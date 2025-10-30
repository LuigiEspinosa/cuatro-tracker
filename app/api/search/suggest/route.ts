// app/api/search/suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { searchMovies } from "@/lib/tmdb"; // adjust path

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  // call your TMDB wrapper
  const data = await searchMovies(q, 1);

  // normalize to a small payload for the input
  const results =
    (data.results as any[] | undefined)?.slice(0, 8).map((m) => ({
      id: m.id as number,
      title: (m.title || m.name) as string,
      year: m.release_date ? m.release_date.slice(0, 4) : undefined,
      poster: m.poster_path
        ? `https://image.tmdb.org/t/p/w92${m.poster_path}`
        : null,
    })) ?? [];

  return NextResponse.json({ results });
}
