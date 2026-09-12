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
  // Sealed products (booster boxes, ETBs, tins) live in the same table with card_number = null.
  const sealedRows = await db
    .select()
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.tcg, set.tcg),
        eq(schema.cards.language, set.language),
        group?.setId ? or(eq(schema.cards.setId, group.setId), eq(schema.cards.setCode, set.code)) : eq(schema.cards.setCode, set.code),
        sql`card_number is null`,
      ),
    );

  const byNumber = new Map<string, ReturnType<typeof rowToCard>>();
  for (const r of rows.sort((a, b) => Number(b.id.startsWith("tp:")) - Number(a.id.startsWith("tp:")))) {
    const key = (r.cardNumber ?? "").trim().toLowerCase() || r.id;
    if (!byNumber.has(key)) byNumber.set(key, rowToCard(r));
  }
  const cards = [...byNumber.values()];
  const ids = cards.map((c) => c.id);
  const owned = new Map<string, number>();
  if (ids.length || sealedRows.length) {
    const items = await db.select({ cardId: schema.portfolioItems.cardId, qty: schema.portfolioItems.quantity }).from(schema.portfolioItems);
    for (const it of items) owned.set(it.cardId, (owned.get(it.cardId) ?? 0) + it.qty);
  }
  const ownedNumbers = new Set<string>();
  const allOwnedCards = await db.select({ card: schema.cards }).from(schema.portfolioItems).innerJoin(schema.cards, eq(schema.portfolioItems.cardId, schema.cards.id)).where(and(eq(schema.cards.tcg, set.tcg), eq(schema.cards.language, set.language), eq(schema.cards.setCode, set.code)));
  for (const { card } of allOwnedCards) ownedNumbers.add((card.cardNumber ?? "").trim().toLowerCase());

  let missingCost = 0;
  let totalValue = 0;
  let ownedCount = 0;
  const list = cards
    .map((c) => {
      const bp = bestPrice(c.prices);
      const price = bp ? convert(bp.amount, bp.currency, currency, fx) : null;
      const key = (c.cardNumber ?? "").trim().toLowerCase();
      const qty = owned.get(c.id) ?? (ownedNumbers.has(key) ? 1 : 0);
      if (qty > 0) ownedCount++;
      else if (price != null) missingCost += price;
      if (price != null) totalValue += price;
      const tcgpUrl = c.prices.tcgplayer?.url ?? null;
      return { id: c.id, name: c.name, cardNumber: c.cardNumber, rarity: c.rarity, imageUrl: c.imageUrl ?? null, price, tcgplayerUrl: tcgpUrl, owned: qty };
    })
    .sort((a, b) => (a.cardNumber ?? "").localeCompare(b.cardNumber ?? "", undefined, { numeric: true }));

  const sealed = sealedRows
    .map((r) => {
      const c = rowToCard(r);
      const bp = bestPrice(c.prices);
      // Include raw prices so the "+ Add" sheet can show the market price.
      const tcgpUrl = c.prices.tcgplayer?.url ?? null;
      return { id: c.id, name: c.name, imageUrl: c.imageUrl ?? null, price: bp ? convert(bp.amount, bp.currency, currency, fx) : null, tcgplayerUrl: tcgpUrl, prices: c.prices, owned: owned.get(c.id) ?? 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    set,
    currency,
    cards: list,
    sealed,
    completion: { owned: ownedCount, total: list.length, pct: list.length ? (ownedCount / list.length) * 100 : 0, missingCost, totalValue },
  });
}
