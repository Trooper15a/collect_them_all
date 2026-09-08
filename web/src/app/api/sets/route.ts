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

// Same card-number normalization the set-detail route uses (api/sets/[id]):
// strip anything after "/", trim, strip leading zeros (keeping a lone "0"),
// lowercase — so list-page totals match the detail page's completion count.
// NULL card numbers (sealed products) must stay NULL so count(distinct) skips them.
const NORMALIZED_NUMBER = sql`case when ${schema.cards.cardNumber} is not null then lower(coalesce(nullif(regexp_replace(trim(split_part(${schema.cards.cardNumber}, '/', 1)), '^0+', ''), ''), '0')) end`;
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
    return NextResponse.json({
      sets: sets.map((s) => {
        const total = cardTotals[s.id.toLowerCase()];
        return total !== undefined ? { ...s, total } : s;
      }),
      owned,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
