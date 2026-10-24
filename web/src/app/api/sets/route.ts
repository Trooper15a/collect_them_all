import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TCG_IDS } from "@/lib/types";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { listSets } from "@/lib/cards";
import { cached } from "@/lib/cache";
import { auth } from "@/lib/auth";
import { binderScope, ownedPortfolioIds } from "@/lib/ownership";
import { setKey } from "@/lib/set-identity";

const Query = z.object({
  tcg: z.enum(["all", ...TCG_IDS]).default("all"),
  lang: z.enum(["all", "eng", "jap"]).default("all"),
});

// Normalize numeric denominators and leading zeros like cardNumberKey. Sealed
// products remain NULL so distinct counts only include singles.
const NORMALIZED_NUMBER = sql`case when ${schema.cards.cardNumber} is not null then regexp_replace(regexp_replace(lower(trim(${schema.cards.cardNumber})), '/[0-9]+$', ''), '^([a-z]*)0+([0-9])', '\\1\\2') end`;
// Codes are grouped lowercased because TCGCSV set rows use uppercase codes
// (mtg:MH3:eng) while e.g. Scryfall-imported cards store them lowercase
// (mtg:mh3:eng) — one set, one total.
const LOWER_CODE = sql<string>`lower(${schema.cards.setCode})`;

export async function GET(req: NextRequest) {
  const userId = (await auth())?.user?.id;
  const scope = await binderScope(userId, req.nextUrl.searchParams.get("binderId"));
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  try {
    const sets = await listSets(parsed.data.tcg, parsed.data.lang);
    // TCGCSV set totals count every product (incl. sealed); card completion should only
    // count actual cards, so override with a card-only total once cards are imported.
    // Cached briefly — this scans/groups the entire cards table on every mount.
    const cardTotalRows = await cached("sets:card-totals:v2", 60, () =>
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
    const ownedRows = userId ? await db
      .select({ tcg: schema.cards.tcg, code: LOWER_CODE, language: schema.cards.language, n: sql<number>`count(distinct ${NORMALIZED_NUMBER})` })
      .from(schema.portfolioItems)
      .innerJoin(schema.cards, eq(schema.portfolioItems.cardId, schema.cards.id))
      .where(and(gt(schema.portfolioItems.quantity, 0), scope.id ? eq(schema.portfolioItems.portfolioId, scope.id) : inArray(schema.portfolioItems.portfolioId, ownedPortfolioIds(userId))))
      .groupBy(schema.cards.tcg, LOWER_CODE, schema.cards.language) : [];
    const owned: Record<string, number> = {};
    for (const r of ownedRows) if (r.code) owned[`${r.tcg}:${r.code}:${r.language}`] = Number(r.n);
    const enriched = sets
      .map((s) => {
        const key = setKey(s);
        const dbCount = cardTotals[key];
        return { ...s, total: dbCount ?? s.total, owned: owned[key] ?? 0, catalogTotal: s.total, catalogComplete: dbCount != null && s.total != null && dbCount >= s.total };
      })
      .filter((s) => {
        const key = setKey(s);
        const dbCount = cardTotals[key];
        if (dbCount === undefined) return s.total != null;
        return dbCount > 0;
      });
    return NextResponse.json({ sets: enriched, owned }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
