import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCard, recordPriceSnapshot, refreshCardPrices, rowToCard } from "./cards";
import { convert, getRates, type Rates } from "./currency";
import { daysAgo, today, type Range, rangeToDays } from "./format";
import { GRADE_MULT } from "./grades";
import { pokewalletLimiter } from "./pokewallet";
import { bestPrice, type CardPrices, type NormalizedCard } from "./types";

export interface ValuedItem {
  id: number;
  portfolioId: number;
  portfolioName: string;
  card: NormalizedCard;
  quantity: number;
  variantType: string;
  condition: string;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  costBasis: number | null;
  costCurrency: string;
  notes: string | null;
  addedAt: string;
  unitPrice: { amount: number; currency: "USD" | "EUR"; variant: string } | null;
  value: number;
  cost: number | null;
  gain: number | null;
  gainPct: number | null;
  change24h: number | null;
  change24hPct: number | null;
}

const CONDITION_MULT: Record<string, number> = { NM: 1, LP: 0.85, MP: 0.7, HP: 0.5, DMG: 0.35 };

export function unitValue(card: NormalizedCard, variant: string, condition: string, isGraded: boolean, gradingCompany: string | null, grade: string | null) {
  const bp = bestPrice(card.prices, variant);
  if (!bp) return null;
  let mult = isGraded ? (GRADE_MULT[`${gradingCompany} ${grade}`] ?? 1) : (CONDITION_MULT[condition] ?? 1);
  if (!Number.isFinite(mult)) mult = 1;
  return { amount: bp.amount * mult, currency: bp.currency, variant: bp.variant, raw: bp.amount };
}

async function yesterdayPrice(cardId: string, variant: string): Promise<{ tcgplayerMarket: number | null; cardmarketAvg: number | null } | null> {
  const rows = await db
    .select()
    .from(schema.priceHistory)
    .where(and(eq(schema.priceHistory.cardId, cardId), eq(schema.priceHistory.variantType, variant), sql`date < ${today()}`))
    .orderBy(sql`date desc`)
    .limit(1);
  return rows[0] ?? null;
}

export async function valuedItems(portfolioId: number | null, displayCurrency: string, rates?: Rates, userId?: string | null): Promise<ValuedItem[]> {
  const fx = rates ?? (await getRates());
  const conditions = [];
  if (portfolioId != null) conditions.push(eq(schema.portfolioItems.portfolioId, portfolioId));
  if (userId) conditions.push(eq(schema.portfolios.userId, userId));
  const rows = await db
    .select({ item: schema.portfolioItems, card: schema.cards, portfolioName: schema.portfolios.name })
    .from(schema.portfolioItems)
    .innerJoin(schema.cards, eq(schema.portfolioItems.cardId, schema.cards.id))
    .innerJoin(schema.portfolios, eq(schema.portfolioItems.portfolioId, schema.portfolios.id))
    .where(conditions.length ? and(...conditions) : sql`1=1`);

  const result: ValuedItem[] = [];
  for (const { item, card: cardRow, portfolioName } of rows) {
    const card = rowToCard(cardRow);
    const uv = unitValue(card, item.variantType, item.condition, item.isGraded, item.gradingCompany, item.grade);
    const unitDisplay = uv ? convert(uv.amount, uv.currency, displayCurrency, fx) : 0;
    const value = unitDisplay * item.quantity;
    const cost = item.costBasis != null ? convert(item.costBasis, item.costCurrency, displayCurrency, fx) * item.quantity : null;
    const gain = cost != null && uv ? value - cost : null;
    const gainPct = gain != null && cost ? (gain / cost) * 100 : null;

    let change24h: number | null = null;
    let change24hPct: number | null = null;
    if (uv) {
      const prev = await yesterdayPrice(card.id, uv.variant);
      const prevAmount = prev ? (uv.currency === "USD" ? prev.tcgplayerMarket : prev.cardmarketAvg) : null;
      if (prevAmount != null && prevAmount > 0) {
        const delta = uv.raw - prevAmount;
        change24h = convert(delta, uv.currency, displayCurrency, fx);
        change24hPct = (delta / prevAmount) * 100;
      }
    }
    result.push({
      id: item.id,
      portfolioId: item.portfolioId,
      portfolioName,
      card,
      quantity: item.quantity,
      variantType: item.variantType,
      condition: item.condition,
      isGraded: item.isGraded,
      gradingCompany: item.gradingCompany,
      grade: item.grade,
      certNumber: item.certNumber,
      costBasis: item.costBasis,
      costCurrency: item.costCurrency,
      notes: item.notes,
      addedAt: item.addedAt,
      unitPrice: uv ? { amount: uv.amount, currency: uv.currency, variant: uv.variant } : null,
      value,
      cost,
      gain,
      gainPct,
      change24h,
      change24hPct,
    });
  }
  return result;
}

export function summarize(items: ValuedItem[]) {
  const value = items.reduce((s, i) => s + i.value, 0);
  const costItems = items.filter((i) => i.cost != null);
  const cost = costItems.reduce((s, i) => s + (i.cost ?? 0), 0);
  const valueWithCost = costItems.reduce((s, i) => s + i.value, 0);
  const gain = valueWithCost - cost;
  const change24h = items.reduce((s, i) => s + (i.change24h ?? 0) * i.quantity, 0);
  return {
    value,
    cost,
    gain,
    gainPct: cost > 0 ? (gain / cost) * 100 : null,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    uniqueCount: items.length,
    change24h,
    change24hPct: value - change24h > 0 ? (change24h / (value - change24h)) * 100 : null,
  };
}

export async function snapshotPortfolios() {
  const fx = await getRates();
  const date = today();
  const all = await valuedItems(null, "USD", fx);
  const byPortfolio = new Map<number, ValuedItem[]>();
  for (const it of all) byPortfolio.set(it.portfolioId, [...(byPortfolio.get(it.portfolioId) ?? []), it]);
  const write = async (portfolioId: number | null, items: ValuedItem[]) => {
    const s = summarize(items);
    await db.insert(schema.portfolioSnapshots)
      .values({ portfolioId, date, valueUsd: s.value, costUsd: s.cost, itemCount: s.itemCount })
      .onConflictDoUpdate({ target: [schema.portfolioSnapshots.portfolioId, schema.portfolioSnapshots.date], set: { valueUsd: s.value, costUsd: s.cost, itemCount: s.itemCount } });
  };
  await write(0, all);
  const portfolios = await db.select().from(schema.portfolios);
  for (const p of portfolios) await write(p.id, byPortfolio.get(p.id) ?? []);
}

export async function valueSeries(portfolioId: number | null, range: Range, displayCurrency: string, fx: Rates) {
  const days = rangeToDays(range);
  const rows = await db
    .select()
    .from(schema.portfolioSnapshots)
    .where(and(eq(schema.portfolioSnapshots.portfolioId, portfolioId ?? 0), days ? gte(schema.portfolioSnapshots.date, daysAgo(days)) : sql`1=1`))
    .orderBy(schema.portfolioSnapshots.date);
  return rows.map((r) => ({ date: r.date, value: convert(r.valueUsd, "USD", displayCurrency, fx), cost: convert(r.costUsd, "USD", displayCurrency, fx) }));
}

export async function refreshOwnedPrices(opts: { maxCards?: number; onlyStale?: boolean } = {}) {
  const itemRows = await db.select({ cardId: schema.portfolioItems.cardId }).from(schema.portfolioItems);
  const ids = [...new Set(itemRows.map((r) => r.cardId))];
  const cards = ids.length ? await db.select().from(schema.cards).where(inArray(schema.cards.id, ids)) : [];
  const stale = opts.onlyStale === false ? cards : cards.filter((c) => !c.priceUpdatedAt || Date.now() - Date.parse(c.priceUpdatedAt) > 20 * 3600 * 1000);
  const ordered = [...stale.filter((c) => !c.id.startsWith("pw:")), ...stale.filter((c) => c.id.startsWith("pw:"))];
  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  for (const c of ordered.slice(0, opts.maxCards ?? 500)) {
    if (c.id.startsWith("pw:") && pokewalletLimiter.remaining.hour < 5) {
      skipped++;
      continue;
    }
    try {
      await refreshCardPrices(c.id);
      refreshed++;
    } catch {
      failed++;
    }
  }
  for (const c of cards) {
    const card = await getCard(c.id).catch(() => null);
    if (card) await recordIfMissing(card);
  }
  await snapshotPortfolios();
  return { refreshed, failed, skipped, total: cards.length };
}

async function recordIfMissing(card: NormalizedCard) {
  const exists = await db
    .select({ id: schema.priceHistory.id })
    .from(schema.priceHistory)
    .where(and(eq(schema.priceHistory.cardId, card.id), eq(schema.priceHistory.date, today())))
    .limit(1);
  if (exists[0]) return;
  const prices = card.prices as CardPrices;
  if (!prices.tcgplayer && !prices.cardmarket) return;
  await recordPriceSnapshot(card);
}
