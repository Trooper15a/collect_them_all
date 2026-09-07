import { and, eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/cache";
import { rowToCard } from "@/lib/cards";
import { convert, getRates } from "@/lib/currency";
import { bestPrice } from "@/lib/types";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await ctx.params).id);
  const sets = await db.select().from(schema.sets).where(eq(schema.sets.id, id)).limit(1);
  const set = sets[0];
  if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });
  const currency = req.nextUrl.searchParams.get("currency") ?? await getSetting("currency", "USD");
  const fx = await getRates();

  const groupRows = await db.select({ setId: schema.cards.setId }).from(schema.cards).where(and(eq(schema.cards.tcg, set.tcg), eq(schema.cards.setCode, set.code), eq(schema.cards.language, set.language), sql`id like 'tp:%'`)).limit(1);
  const group = groupRows[0];
  const rows = await db
    .select()
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.tcg, set.tcg),
        eq(schema.cards.language, set.language),
        group?.setId ? or(eq(schema.cards.setId, group.setId), eq(schema.cards.setCode, set.code)) : eq(schema.cards.setCode, set.code),
        sql`card_number is not null`,
      ),
    );
  const byNumber = new Map<string, ReturnType<typeof rowToCard>>();
  for (const r of rows.sort((a, b) => Number(b.id.startsWith("tp:")) - Number(a.id.startsWith("tp:")))) {
    const key = (r.cardNumber ?? "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase() || r.id;
    if (!byNumber.has(key)) byNumber.set(key, rowToCard(r));
  }
  const cards = [...byNumber.values()];
  const ids = cards.map((c) => c.id);
  const owned = new Map<string, number>();
  if (ids.length) {
    const items = await db.select({ cardId: schema.portfolioItems.cardId, qty: schema.portfolioItems.quantity }).from(schema.portfolioItems);
    for (const it of items) owned.set(it.cardId, (owned.get(it.cardId) ?? 0) + it.qty);
  }
  const ownedNumbers = new Set<string>();
  const allOwnedCards = await db.select({ card: schema.cards }).from(schema.portfolioItems).innerJoin(schema.cards, eq(schema.portfolioItems.cardId, schema.cards.id)).where(and(eq(schema.cards.tcg, set.tcg), eq(schema.cards.language, set.language), eq(schema.cards.setCode, set.code)));
  for (const { card } of allOwnedCards) ownedNumbers.add((card.cardNumber ?? "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase());

  let missingCost = 0;
  let totalValue = 0;
  let ownedCount = 0;
  const list = cards
    .map((c) => {
      const bp = bestPrice(c.prices);
      const price = bp ? convert(bp.amount, bp.currency, currency, fx) : null;
      const key = (c.cardNumber ?? "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase();
      const qty = owned.get(c.id) ?? (ownedNumbers.has(key) ? 1 : 0);
      if (qty > 0) ownedCount++;
      else if (price != null) missingCost += price;
      if (price != null) totalValue += price;
      return { id: c.id, name: c.name, cardNumber: c.cardNumber, rarity: c.rarity, price, owned: qty };
    })
    .sort((a, b) => (a.cardNumber ?? "").localeCompare(b.cardNumber ?? "", undefined, { numeric: true }));

  return NextResponse.json({
    set,
    currency,
    cards: list,
    completion: { owned: ownedCount, total: list.length, pct: list.length ? (ownedCount / list.length) * 100 : 0, missingCost, totalValue },
  });
}
