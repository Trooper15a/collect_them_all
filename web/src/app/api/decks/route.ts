import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { saveDeck, limitlessToDeckEntries, ydkToDeckEntries, type DeckEntry } from "@/lib/decks";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(schema.decks).where(eq(schema.decks.userId, session.user.id));
  return NextResponse.json({ decks: rows });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { source, tcg, name } = body as { source: string; tcg: string; name: string };

  if (!source || !tcg || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let entries: DeckEntry[] = [];

  if (source === "ydk") {
    const { ydkText } = body as { ydkText: string };
    if (!ydkText) return NextResponse.json({ error: "Missing YDK text" }, { status: 400 });
    entries = await ydkToDeckEntries(ydkText);
  } else if (source === "limitless") {
    const { standing } = body;
    if (!standing) return NextResponse.json({ error: "Missing standing data" }, { status: 400 });
    entries = limitlessToDeckEntries(standing);
  } else if (source === "manual") {
    entries = (body.entries ?? []) as DeckEntry[];
  } else {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const deck = await saveDeck({
    userId: session.user.id,
    tcg,
    name,
    source,
    sourceUrl: body.sourceUrl,
    format: body.format,
    author: body.author,
    placing: body.placing,
    tournamentName: body.tournamentName,
    entries,
  });

  return NextResponse.json({ deck }, { status: 201 });
}
