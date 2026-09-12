import { NextRequest, NextResponse } from "next/server";
import { fetchLimitlessTournaments, fetchLimitlessStandings } from "@/lib/decks";

export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get("tournament");

  if (tournamentId) {
    const topN = Number(req.nextUrl.searchParams.get("top") ?? "8");
    const standings = await fetchLimitlessStandings(tournamentId, topN);
    return NextResponse.json({ standings });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const tournaments = await fetchLimitlessTournaments(limit);
  return NextResponse.json({ tournaments });
}
