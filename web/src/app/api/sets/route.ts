import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TCG_IDS } from "@/lib/types";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { listSets } from "@/lib/cards";

const Query = z.object({
  tcg: z.enum(["all", ...TCG_IDS]).default("all"),
  lang: z.enum(["all", "eng", "jap"]).default("all"),
});

export async function GET(req: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  try {
    const sets = await listSets(parsed.data.tcg, parsed.data.lang);
    // TCGCSV set totals count every product (incl. sealed); card completion should only
    // count actual cards, so override with a card-only total once cards are imported.
    const cardTotalRows = await db
      .select({ tcg: schema.cards.tcg, code: schema.cards.setCode, language: schema.cards.language, n: sql<number>`count(distinct ${schema.cards.cardNumber})` })
      .from(schema.cards)
      .where(sql`${schema.cards.cardNumber} is not null`)
      .groupBy(schema.cards.tcg, schema.cards.setCode, schema.cards.language);
    const cardTotals: Record<string, number> = {};
    for (const r of cardTotalRows) if (r.code) cardTotals[`${r.tcg}:${r.code}:${r.language}`] = r.n;
    const ownedRows = await db
      .select({ tcg: schema.cards.tcg, code: schema.cards.setCode, language: schema.cards.language, n: sql<number>`count(distinct ${schema.cards.cardNumber})` })
      .from(schema.portfolioItems)
      .innerJoin(schema.cards, eq(schema.portfolioItems.cardId, schema.cards.id))
      .groupBy(schema.cards.tcg, schema.cards.setCode, schema.cards.language);
    const owned: Record<string, number> = {};
    for (const r of ownedRows) if (r.code) owned[`${r.tcg}:${r.code}:${r.language}`] = r.n;
    return NextResponse.json({ sets: sets.map((s) => (cardTotals[s.id] ? { ...s, total: cardTotals[s.id] } : s)), owned });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
