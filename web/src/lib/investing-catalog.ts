import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { getCard, getPriceHistory } from './cards';
import { analyzeMarket, marketReferences, type HistoryPoint, type MarketEntry, type MarketSource } from './investing';

interface CatalogRow extends Record<string, unknown> {
  id: string; name: string; setName: string | null; cardNumber: string | null; language: string; imageUrl: string | null;
  variant: string; amount: string; updatedAt: string | null; currency: string; samples: number;
  history: (HistoryPoint | null)[];
}
const cache = new Map<MarketSource, { until: number; entries: MarketEntry[] }>();
const pending = new Map<MarketSource, Promise<MarketEntry[]>>();

/** All imported Pokémon singles, independent of account holdings. Aggregate in SQL to keep the payload small. */
async function readCatalog(source: MarketSource): Promise<MarketEntry[]> {
  const now = Date.now();
  const day = (offset: number) => new Date(Math.floor(now / 86_400_000) * 86_400_000 - offset * 86_400_000).toISOString().slice(0, 10);
  // Column names are selected from a closed enum, never from request text.
  const price = source === 'tcgplayer' ? sql`h.tcgplayer_market` : sql`h.cardmarket_avg`;
  const point = sql`jsonb_build_object('date', h.date, 'variantType', v.key, ${source === 'tcgplayer' ? 'tcgplayerMarket' : 'cardmarketAvg'}::text, ${price})`;
  const baseline = (days: number) => sql`(jsonb_agg(${point} ORDER BY h.date DESC) FILTER (WHERE h.date BETWEEN ${day(days + 6)} AND ${day(days)}))->0`;
  const rows = await db.execute<CatalogRow>(sql`
    SELECT c.id, c.name, c.set_name AS "setName", c.card_number AS "cardNumber", c.language, c.image_url AS "imageUrl",
      v.key AS variant, v.value->>'market' AS amount,
      c.prices_json::jsonb->${source}->>'updatedAt' AS "updatedAt",
      c.prices_json::jsonb->${source}->>'currency' AS currency,
      COALESCE(summary.samples, 0) AS samples,
      jsonb_build_array(summary.week, summary.month, summary.quarter) AS history
    FROM cards c
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(c.prices_json::jsonb->${source}->'variants') = 'object'
        THEN c.prices_json::jsonb->${source}->'variants' ELSE '{}'::jsonb END
    ) v
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS samples, ${baseline(7)} AS week, ${baseline(30)} AS month, ${baseline(90)} AS quarter
      FROM price_history h
      WHERE h.card_id = c.id AND h.variant_type = v.key AND h.date BETWEEN ${day(97)} AND ${day(0)}
        AND ${price} > 0 AND ${price} < 'Infinity'::double precision
    ) summary ON true
    WHERE c.tcg = 'pokemon' AND c.id LIKE 'tp:%'
      AND COALESCE(c.meta_json::jsonb->>'sealed', 'false') <> 'true'
      AND COALESCE(c.rarity, '') <> 'Sealed'
  `);
  const entries: MarketEntry[] = [];
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !['USD', 'EUR'].includes(row.currency)) continue;
    const reference = { source, variant: row.variant, amount, currency: row.currency, updatedAt: row.updatedAt, metric: 'market' };
    const history = (row.history ?? []).filter((point): point is HistoryPoint => point !== null);
    entries.push({ key: `${row.id}:${source}:${row.variant}`, id: row.id, name: row.name, setName: row.setName,
      cardNumber: row.cardNumber, language: row.language, imageUrl: row.imageUrl,
      analysis: analyzeMarket(reference, history, now, { samples: row.samples }) });
  }
  return entries;
}

export async function getMarketCatalog(source: MarketSource) {
  const saved = cache.get(source);
  if (saved && saved.until > Date.now()) return saved.entries;
  const existing = pending.get(source);
  if (existing) return existing;
  const promise = readCatalog(source).then((entries) => {
    cache.set(source, { until: Date.now() + 5 * 60_000, entries });
    return entries;
  }).finally(() => pending.delete(source));
  pending.set(source, promise);
  return promise;
}

/** Read-only: opening an offer never starts a provider refresh or history backfill. */
export async function getInvestingCard(id: string) {
  const card = await getCard(id);
  if (!card || card.meta?.sealed === true || card.rarity === 'Sealed') return null;
  const history = await getPriceHistory(id);
  return { card, history, analyses: marketReferences(card.prices).map((reference) => analyzeMarket(reference, history)) };
}
