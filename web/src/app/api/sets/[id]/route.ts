import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getUserSetting } from "@/lib/user-settings";
import { auth } from "@/lib/auth";
import { binderScope, ownedPortfolioIds } from "@/lib/ownership";
import { rowToCard } from "@/lib/cards";
import { convert, getRates } from "@/lib/currency";
import { bestPrice } from "@/lib/types";
import { cardNumberKey } from "@/lib/set-identity";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = (await auth())?.user?.id;
  const scope = await binderScope(userId, req.nextUrl.searchParams.get("binderId"));
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const id = decodeURIComponent((await ctx.params).id);
  const [set] = await db.select().from(schema.sets).where(eq(schema.sets.id, id)).limit(1);
  if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });
  const currency = req.nextUrl.searchParams.get("currency") ?? await getUserSetting("currency", "USD");
  const fx = await getRates();
  const setFilter = and(eq(schema.cards.tcg, set.tcg), eq(schema.cards.language, set.language), eq(sql`lower(${schema.cards.setCode})`, set.code.toLowerCase()));
  const rows = await db.select().from(schema.cards).where(setFilter);
  // Sum copies across providers before choosing a representative catalogue card.
  const holdings = userId ? await db.select({ card: schema.cards, qty: schema.portfolioItems.quantity })
    .from(schema.portfolioItems).innerJoin(schema.cards, eq(schema.portfolioItems.cardId, schema.cards.id))
    .where(and(setFilter, scope.id ? eq(schema.portfolioItems.portfolioId, scope.id) : inArray(schema.portfolioItems.portfolioId, ownedPortfolioIds(userId)))) : [];
  const owned = new Map<string, number>();
  for (const { card, qty } of holdings) {
    const key = cardNumberKey(card.cardNumber, card.id);
    owned.set(key, (owned.get(key) ?? 0) + qty);
  }
  const byNumber = new Map<string, ReturnType<typeof rowToCard>>();
  const sealed = [];
  for (const row of rows.sort((a, b) => Number(b.id.startsWith("tp:")) - Number(a.id.startsWith("tp:")))) {
    const card = rowToCard(row);
    if (row.cardNumber == null) { sealed.push(card); continue; }
    const key = cardNumberKey(row.cardNumber, row.id);
    if (!byNumber.has(key)) byNumber.set(key, card);
  }
  let missingCost = 0, totalValue = 0, ownedCount = 0, unpricedMissing = 0;
  const list = [...byNumber.entries()].map(([key, card]) => {
    const quote = bestPrice(card.prices, "normal") ?? bestPrice(card.prices);
    const price = quote ? convert(quote.amount, quote.currency, currency, fx) : null;
    const qty = owned.get(key) ?? 0;
    if (qty > 0) ownedCount++;
    else if (price != null) missingCost += price;
    else unpricedMissing++;
    if (price != null) totalValue += price;
    return { id: card.id, name: card.name, cardNumber: card.cardNumber, rarity: card.rarity, imageUrl: card.imageUrl ?? null,
      price, priceVariant: quote?.variant ?? null, prices: card.prices, tcgplayerUrl: card.prices.tcgplayer?.url ?? null, owned: qty };
  }).sort((a, b) => (a.cardNumber ?? "").localeCompare(b.cardNumber ?? "", undefined, { numeric: true }));
  return NextResponse.json({ set, currency, binderId: scope.id, cards: list,
    sealed: sealed.map((card) => {
      const quote = bestPrice(card.prices);
      return { id: card.id, name: card.name, imageUrl: card.imageUrl ?? null, price: quote ? convert(quote.amount, quote.currency, currency, fx) : null,
        tcgplayerUrl: card.prices.tcgplayer?.url ?? null, prices: card.prices, owned: owned.get(card.id) ?? 0 };
    }).sort((a, b) => a.name.localeCompare(b.name)),
    completion: { owned: ownedCount, total: list.length, pct: list.length ? ownedCount / list.length * 100 : 0, missingCost, totalValue,
      unpricedMissing, catalogTotal: set.total, catalogComplete: set.total != null && list.length >= set.total },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
