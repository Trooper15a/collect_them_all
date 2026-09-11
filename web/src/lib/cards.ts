import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { cached, getSetting } from "./cache";
import { convert, getRates } from "./currency";
import { nowIso, today } from "./format";
import { bestPrice, type CardPrices, type CardSummary, type NormalizedCard, type Tcg } from "./types";
import { TCGCSV_CATEGORIES } from "./tcgcsv";

/** Collector shorthand -> substring of the TCGPlayer rarity name. */
const RARITY_ALIASES: Record<string, string> = {
  sar: "special art rare",
  ar: "art rare",
  sr: "super rare",
  ur: "ultra rare",
  hr: "hyper rare",
  chr: "character rare",
  csr: "character super rare",
  rr: "double rare",
  rrr: "triple rare",
  ssr: "shiny secret rare",
  mur: "mega ultra rare",
  mar: "mega attack rare",
  bwr: "black white rare",
  promo: "promo",
};

export function sourceOf(cardId: string): "pw" | "sf" | "ygo" | "tp" {
  const p = cardId.split(":")[0];
  if (p === "pw" || p === "sf" || p === "ygo" || p === "tp") return p;
  throw new Error(`unknown card id prefix: ${cardId}`);
}

export function rowToCard(row: schema.Card): NormalizedCard {
  return {
    id: row.id,
    tcg: row.tcg as Tcg,
    name: row.name,
    setName: row.setName,
    setCode: row.setCode,
    setId: row.setId,
    cardNumber: row.cardNumber,
    rarity: row.rarity,
    variant: row.variant,
    language: row.language,
    imageUrl: row.imageUrl,
    releaseDate: row.releaseDate,
    sourceId: row.sourceId,
    // Legacy rows may hold the literal text "null" — JSON.parse returns null for it.
    prices: row.pricesJson ? ((JSON.parse(row.pricesJson) as CardPrices | null) ?? {}) : {},
    meta: row.metaJson ? JSON.parse(row.metaJson) : undefined,
  };
}

export function toSummary(c: NormalizedCard): CardSummary {
  const bp = bestPrice(c.prices);
  return {
    id: c.id,
    tcg: c.tcg,
    name: c.name,
    setName: c.setName,
    setCode: c.setCode,
    cardNumber: c.cardNumber,
    rarity: c.rarity,
    language: c.language,
    price: bp ? { amount: bp.amount, currency: bp.currency, variant: bp.variant } : null,
    prices: c.prices,
  };
}

/** Insert/update the card row and record today's price snapshot. */
export async function upsertCard(c: NormalizedCard, opts: { touchPrices?: boolean } = { touchPrices: true }) {
  const now = nowIso();
  const hasPrices = !!(c.prices.tcgplayer || c.prices.cardmarket);
  await db.insert(schema.cards)
    .values({
      id: c.id,
      tcg: c.tcg,
      name: c.name,
      setName: c.setName ?? null,
      setCode: c.setCode ?? null,
      setId: c.setId ?? null,
      cardNumber: c.cardNumber ?? null,
      rarity: c.rarity ?? null,
      variant: c.variant ?? null,
      language: c.language,
      imageUrl: c.imageUrl ?? null,
      releaseDate: c.releaseDate ?? null,
      sourceId: c.sourceId,
      pricesJson: hasPrices ? JSON.stringify(c.prices) : null,
      priceUpdatedAt: hasPrices ? now : null,
      metaJson: c.meta ? JSON.stringify(c.meta) : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.cards.id,
      set: {
        name: c.name,
        setName: c.setName ?? null,
        setCode: c.setCode ?? null,
        cardNumber: c.cardNumber ?? null,
        rarity: c.rarity ?? null,
        language: c.language,
        imageUrl: c.imageUrl ?? null,
        releaseDate: c.releaseDate ?? null,
        ...(hasPrices ? { pricesJson: JSON.stringify(c.prices), priceUpdatedAt: now } : {}),
        ...(c.meta ? { metaJson: JSON.stringify(c.meta) } : {}),
        updatedAt: now,
      },
    });
  if (hasPrices && opts.touchPrices !== false) await recordPriceSnapshot(c);
}

/** Write today's price rows (one per market+variant) and the compact price_history row. */
export async function recordPriceSnapshot(c: NormalizedCard, date = today()) {
  const now = nowIso();
  const markets: ("tcgplayer" | "cardmarket")[] = ["tcgplayer", "cardmarket"];
  const variantSet = new Set<string>();
  for (const m of markets) {
    const mp = c.prices[m];
    if (!mp) continue;
    for (const [variant, v] of Object.entries(mp.variants)) {
      variantSet.add(variant);
      await db.insert(schema.cardPrices)
        .values({
          cardId: c.id,
          date,
          variantType: variant,
          source: m,
          currency: mp.currency,
          market: v.market ?? null,
          low: v.low ?? null,
          mid: v.mid ?? null,
          high: v.high ?? null,
          trend: v.trend ?? null,
          avg1: v.avg1 ?? null,
          avg7: v.avg7 ?? null,
          avg30: v.avg30 ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.cardPrices.cardId, schema.cardPrices.date, schema.cardPrices.variantType, schema.cardPrices.source],
          set: {
            market: v.market ?? null,
            low: v.low ?? null,
            mid: v.mid ?? null,
            high: v.high ?? null,
            trend: v.trend ?? null,
            avg1: v.avg1 ?? null,
            avg7: v.avg7 ?? null,
            avg30: v.avg30 ?? null,
            updatedAt: now,
          },
        });
    }
  }
  for (const variant of variantSet) {
    const tp = c.prices.tcgplayer?.variants[variant];
    const cm = c.prices.cardmarket?.variants[variant] ?? c.prices.cardmarket?.variants.normal;
    await db.insert(schema.priceHistory)
      .values({
        cardId: c.id,
        date,
        variantType: variant,
        tcgplayerMarket: tp?.market ?? null,
        cardmarketAvg: cm?.market ?? cm?.trend ?? cm?.avg7 ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.priceHistory.cardId, schema.priceHistory.date, schema.priceHistory.variantType],
        set: { tcgplayerMarket: tp?.market ?? null, cardmarketAvg: cm?.market ?? cm?.trend ?? cm?.avg7 ?? null },
      });
  }
}

/** Get a card from the local DB. All data comes from the nightly TCGCSV import. */
export async function getCard(cardId: string): Promise<NormalizedCard | null> {
  const rows = await db.select().from(schema.cards).where(eq(schema.cards.id, cardId)).limit(1);
  return rows[0] ? rowToCard(rows[0]) : null;
}

export async function refreshCardPrices(cardId: string) {
  return getCard(cardId);
}

export interface SearchOpts {
  q: string;
  tcg?: Tcg | "all";
  lang?: "eng" | "jap" | "all";
  limit?: number;
}

/** Search the local DB (populated by the nightly TCGCSV import). */
export async function searchCards(opts: SearchOpts): Promise<{ cards: CardSummary[]; warnings: string[] }> {
  const q = opts.q.trim();
  const limit = opts.limit ?? 24;
  const tcg = opts.tcg ?? "all";
  const lang = opts.lang ?? "all";
  const warnings: string[] = [];
  if (!q) return { cards: [], warnings };

  const rarityWords: string[] = [];
  const words = q
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => {
      const r = RARITY_ALIASES[w.toLowerCase()];
      if (r) rarityWords.push(r);
      return !r;
    });
  // Case-insensitive matching (ilike) so lowercase queries like "pikachu" still find cards.
  const conditions = words.map((w) => or(ilike(schema.cards.name, `%${w}%`), ilike(schema.cards.cardNumber, `${w}%`), ilike(schema.cards.setCode, w), ilike(schema.cards.setName, `%${w}%`)));
  for (const r of rarityWords) conditions.push(ilike(schema.cards.rarity, `%${r}%`));
  conditions.push(sql`${schema.cards.id} like 'tp:%'`);
  if (tcg !== "all") conditions.push(eq(schema.cards.tcg, tcg));
  if (lang !== "all") conditions.push(eq(schema.cards.language, lang));
  const localRows = await db
    .select()
    .from(schema.cards)
    .where(and(...conditions))
    .orderBy(sql`case when prices_json is null then 1 else 0 end, length(name)`)
    .limit(400);
  const merged = new Map<string, NormalizedCard>(localRows.map((r) => [r.id, rowToCard(r)]));

  const byPrinting = new Map<string, NormalizedCard>();
  let missingMarketData = false;
  for (const c of merged.values()) {
    // Cards whose stored price blob is null/corrupt must not crash the merge —
    // treat them as unpriced and report a warning instead of a 500.
    if (!c.prices || typeof c.prices !== "object") {
      c.prices = {};
      missingMarketData = true;
    }
    const numKey = (c.cardNumber ?? "").trim().toLowerCase();
    const key = c.setCode && numKey ? `${c.tcg}:${c.language}:${c.setCode.toLowerCase()}:${numKey}` : c.id;
    const prev = byPrinting.get(key);
    if (!prev) {
      byPrinting.set(key, c);
      continue;
    }
    const keep = prev.id.startsWith("tp:") ? prev : c.id.startsWith("tp:") ? c : prev;
    const other = keep === prev ? c : prev;
    if (!keep.prices.cardmarket && other.prices.cardmarket) keep.prices = { ...keep.prices, cardmarket: other.prices.cardmarket };
    if (!keep.prices.tcgplayer && other.prices.tcgplayer) keep.prices = { ...keep.prices, tcgplayer: other.prices.tcgplayer };
    byPrinting.set(key, keep);
  }
  const displayCurrency = await getSetting("currency", "USD");
  const fx = await getRates();
  const cards = [...byPrinting.values()].map((c) => {
    const s = toSummary(c);
    s.display = s.price ? { amount: convert(s.price.amount, s.price.currency, displayCurrency, fx), currency: displayCurrency } : null;
    return s;
  });
  const ql = q.toLowerCase();
  const wantsSealed = /box|etb|bundle|pack|case|collection|tin|display/.test(ql);
  cards.sort((a, b) => {
    const ea = a.name.toLowerCase().startsWith(ql) ? 1 : 0;
    const eb = b.name.toLowerCase().startsWith(ql) ? 1 : 0;
    if (ea !== eb) return eb - ea;
    const sa = !a.cardNumber && !wantsSealed ? 1 : 0;
    const sb = !b.cardNumber && !wantsSealed ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return (b.price?.amount ?? 0) - (a.price?.amount ?? 0);
  });
  if (missingMarketData) warnings.push("Some results have no market data yet — prices appear after the next price sync.");
  return { cards: cards.slice(0, Math.max(60, limit * 2)), warnings };
}

/** Price history from local daily snapshots (recorded by the TCGCSV import). */
export async function getPriceHistory(cardId: string, variant?: string) {
  const rows = await db
    .select()
    .from(schema.priceHistory)
    .where(and(eq(schema.priceHistory.cardId, cardId), variant ? eq(schema.priceHistory.variantType, variant) : sql`1=1`))
    .orderBy(schema.priceHistory.date);
  return rows.map((r) => ({
    date: r.date,
    tcgplayerMarket: r.tcgplayerMarket ?? null,
    cardmarketAvg: r.cardmarketAvg ?? null,
  }));
}

export async function listSets(tcg: Tcg | "all", lang: "eng" | "jap" | "all") {
  const rows = await db.select().from(schema.sets);
  const hasTcg = tcg === "all" ? rows.length > 0 : rows.some((r) => r.tcg === tcg);
  if (!hasTcg) await syncSets(tcg);
  return db
    .select()
    .from(schema.sets)
    .where(and(tcg === "all" ? sql`1=1` : eq(schema.sets.tcg, tcg), lang === "all" ? sql`1=1` : eq(schema.sets.language, lang)))
    .orderBy(sql`release_date desc`);
}

/** Sync sets from TCGCSV for all games. The nightly import also creates sets,
 *  so this is only needed as a fallback when a TCG has zero sets in the DB. */
export async function syncSets(tcg: Tcg | "all" = "all") {
  const cats = TCGCSV_CATEGORIES.filter((c) => tcg === "all" || c.tcg === tcg);
  const jobs: Promise<void>[] = [];
  for (const cat of cats) {
    jobs.push(
      cached(`tcgcsv:sets:${cat.id}`, 7 * 86400, async () => {
        const res = await fetch(`https://tcgcsv.com/tcgplayer/${cat.id}/groups`, {
          headers: { "User-Agent": "ripnpull/0.1" },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`TCGCSV ${res.status}`);
        const data = await res.json();
        return (data.results ?? []) as { groupId: number; name: string; abbreviation?: string; publishedOn?: string }[];
      }).then(async (groups) => {
        for (const g of groups) {
          const code = String(g.abbreviation ?? g.groupId);
          const id = `${cat.tcg}:${code}:${cat.language}`;
          await db.insert(schema.sets)
            .values({ id, tcg: cat.tcg, code, name: g.name, language: cat.language, total: null, releaseDate: g.publishedOn ? String(g.publishedOn).slice(0, 10) : null, imageUrl: null })
            .onConflictDoUpdate({ target: schema.sets.id, set: { name: g.name, releaseDate: g.publishedOn ? String(g.publishedOn).slice(0, 10) : null } });
        }
      }).catch(() => undefined),
    );
  }
  await Promise.all(jobs);
}
