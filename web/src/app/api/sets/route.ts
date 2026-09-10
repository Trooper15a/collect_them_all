import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TCG_IDS } from "@/lib/types";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { listSets } from "@/lib/cards";
import { cached } from "@/lib/cache";

const Query = z.object({
  tcg: z.enum(["all", ...TCG_IDS]).default("all"),
  lang: z.enum(["all", "eng", "jap"]).default("all"),
});

// Normalize card numbers for distinct counting. Some TCGs use "001/100" (number
// before slash) while others use "SET/001EN" (number after slash). We take the
// part that looks like the card number: if the part after the slash starts with a
// digit, use the full string as-is (it's "SET/001EN" style); otherwise split on
// "/" and keep the first segment ("001/100" style). Strip leading zeros, lowercase.
// NULL card numbers (sealed products) stay NULL so count(distinct) skips them.
const NORMALIZED_NUMBER = sql`case when ${schema.cards.cardNumber} is not null then lower(trim(${schema.cards.cardNumber})) end`;
// Codes are grouped lowercased because TCGCSV set rows use uppercase codes
// (mtg:MH3:eng) while e.g. Scryfall-imported cards store them lowercase
// (mtg:mh3:eng) — one set, one total.
const LOWER_CODE = sql<string>`lower(${schema.cards.setCode})`;

export async function GET(req: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  try {
    const sets = await listSets(parsed.data.tcg, parsed.data.lang);
    // TCGCSV set totals count every product (incl. sealed); card completion should only
    // count actual cards, so override with a card-only total once cards are imported.
    // Cached briefly — this scans/groups the entire cards table on every mount.
    const cardTotalRows = await cached("sets:card-totals", 60, () =>
      db
        .select({ tcg: schema.cards.tcg, code: LOWER_CODE, language: schema.cards.language, n: sql<number>`count(distinct ${NORMALIZED_NUMBER})` })
        .from(schema.cards)
        .where(sql`${schema.cards.id} like 'tp:%'`)
        .groupBy(schema.cards.tcg, LOWER_CODE, schema.cards.language),
    );
    const cardTotals: Record<string, number> = {};
    for (const r of cardTotalRows) {
      if (!r.code) continue;
      // A group that only holds sealed products (every card_number null) yields 0 —
      // overriding the inflated TCGCSV product count is exactly what we want.
      cardTotals[`${r.tcg}:${r.code}:${r.language}`] = Number(r.n);
    }
    const ownedRows = await db
      .select({ tcg: schema.cards.tcg, code: LOWER_CODE, language: schema.cards.language, n: sql<number>`count(distinct ${NORMALIZED_NUMBER})` })
      .from(schema.portfolioItems)
      .innerJoin(schema.cards, eq(schema.portfolioItems.cardId, schema.cards.id))
      .groupBy(schema.cards.tcg, LOWER_CODE, schema.cards.language);
    const owned: Record<string, number> = {};
    for (const r of ownedRows) if (r.code) owned[`${r.tcg}:${r.code}:${r.language}`] = Number(r.n);
    const enriched = sets
      .map((s) => {
        const dbCount = cardTotals[s.id.toLowerCase()];
        if (dbCount !== undefined && dbCount > 1) return { ...s, total: dbCount };
        return s;
      })
      .filter((s) => {
        const key = s.id.toLowerCase();
        const dbCount = cardTotals[key];
        if (dbCount === undefined) return s.total != null;
        return dbCount > 1;
      });
    return NextResponse.json({ sets: enriched, owned });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
