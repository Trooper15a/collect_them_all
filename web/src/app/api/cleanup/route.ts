import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * POST /api/cleanup — remove legacy non-TCGCSV data from the database.
 * Deletes old pw:, sf:, ygo: cards and orphaned sets that have no tp: cards.
 * Handles FK constraints by cleaning referencing tables first.
 * Safe to run multiple times.
 */
export async function POST() {
  try {
    const legacyFilter = sql`card_id NOT LIKE 'tp:%'`;

    const [piResult, clResult, boiResult] = await Promise.all([
      db.execute(sql`DELETE FROM ${schema.portfolioItems} WHERE ${legacyFilter}`),
      db.execute(sql`DELETE FROM ${schema.cardLinks} WHERE ${legacyFilter}`),
      db.execute(sql`DELETE FROM ${schema.boxOpenItems} WHERE ${legacyFilter}`),
    ]);

    const legacyCards = await db.execute(
      sql`DELETE FROM ${schema.cards} WHERE ${schema.cards.id} NOT LIKE 'tp:%'`,
    );

    const orphanSets = await db.execute(sql`
      DELETE FROM ${schema.sets} s
      WHERE NOT EXISTS (
        SELECT 1 FROM ${schema.cards} c
        WHERE c.tcg = s.tcg
          AND lower(c.set_code) = lower(s.code)
          AND c.language = s.language
          AND c.id LIKE 'tp:%'
      )
    `);

    const rc = (r: unknown) => (r as { rowCount?: number }).rowCount ?? 0;

    return NextResponse.json({
      deletedCards: rc(legacyCards),
      deletedSets: rc(orphanSets),
      deletedPortfolioItems: rc(piResult),
      deletedCardLinks: rc(clResult),
      deletedBoxOpenItems: rc(boiResult),
    });
  } catch (err) {
    console.error("cleanup error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Cleanup failed" }, { status: 500 });
  }
}
