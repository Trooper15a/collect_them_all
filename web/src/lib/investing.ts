import { exchange, parseAmount } from './card-show';
import type { CardPrices } from './types';

export type MarketSource = 'tcgplayer' | 'cardmarket';
export type MarketPeriod = 7 | 30 | 90;
export interface Reference {
  source: MarketSource; variant: string; amount: number; currency: string;
  updatedAt: string | null; metric: string;
}
export interface HistoryPoint {
  date: string; variantType: string; tcgplayerMarket: number | null; cardmarketAvg: number | null;
}
export interface Change { date: string; amount: number; percent: number; baseline: number }
export interface MarketAnalysis {
  reference: Reference; valid: boolean; fresh: boolean; samples: number;
  changes: Record<MarketPeriod, Change | null>;
  flags: { code: string; message: string }[]; research: boolean;
}
const DAY = 86_400_000;
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
function dateTime(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : NaN;
}

/** Market prices only: listing low/mid prices cannot become sales-based signals. */
export function marketReferences(prices: CardPrices | null | undefined): Reference[] {
  const result: Reference[] = [];
  for (const source of ['tcgplayer', 'cardmarket'] as const) {
    const block = prices?.[source];
    for (const [variant, price] of Object.entries(block?.variants ?? {})) {
      const amount = price.market;
      if (positive(amount) && block) result.push({ source, variant, amount, currency: block.currency, updatedAt: block.updatedAt ?? null, metric: 'market' });
    }
  }
  return result;
}

/** Sparse observations remain sparse; never infer daily volume or fill missing days. */
export function analyzeMarket(reference: Reference, history: HistoryPoint[], now = Date.now(), stats?: { samples: number }): MarketAnalysis {
  const today = Math.floor(now / DAY) * DAY;
  const updated = reference.updatedAt ? Date.parse(reference.updatedAt) : NaN;
  const valid = positive(reference.amount) && reference.metric === 'market';
  const fresh = valid && Number.isFinite(updated) && updated <= now && now - updated <= 3 * DAY;
  const cutoff = Number.isFinite(updated) ? Math.min(today, Math.floor(updated / DAY) * DAY) : today;
  const dated = new Map<string, { date: string; time: number; value: number }>();
  for (const point of history) {
    const time = dateTime(point.date);
    const value = reference.source === 'tcgplayer' ? point.tcgplayerMarket : point.cardmarketAvg;
    if (point.variantType === reference.variant && positive(value) && Number.isFinite(time) && time <= cutoff && time >= today - 97 * DAY) {
      dated.set(point.date, { date: point.date, time, value });
    }
  }
  const observations = [...dated.values()].sort((a, b) => b.time - a.time);
  const changes = { 7: null, 30: null, 90: null } as MarketAnalysis['changes'];
  if (valid) for (const days of [7, 30, 90] as const) {
    const target = today - days * DAY;
    const baseline = observations.find((point) => point.time <= target && point.time >= target - 6 * DAY);
    if (baseline) changes[days] = { date: baseline.date, baseline: baseline.value, amount: reference.amount - baseline.value, percent: (reference.amount / baseline.value - 1) * 100 };
  }
  const samples = stats && Number.isInteger(stats.samples) && stats.samples >= 0 ? stats.samples : observations.length;
  const flags: MarketAnalysis['flags'] = [];
  if (!valid) flags.push({ code: 'reference', message: 'A positive market reference for this exact variant is required.' });
  if (!fresh) flags.push({ code: 'stale', message: 'The reference is over 72 hours old, undated or dated in the future. Verify a current comparable price.' });
  if (samples < 5 || !changes[30]) flags.push({ code: 'history', message: 'Limited history: need five dated observations and a comparable 30-day baseline.' });
  const week = changes[7]?.percent, month = changes[30]?.percent;
  if ((week != null && week >= 20 - 1e-9) || (month != null && month >= 40 - 1e-9)) flags.push({ code: 'spike', message: 'Sharp price rise. Avoid chasing the spike; check current sold comparisons before buying.' });
  if ((week != null && week <= -10 + 1e-9) || (month != null && month <= -20 + 1e-9)) flags.push({ code: 'decline', message: 'Sharp price decline. A discount to today’s market may disappear if the decline continues.' });
  return { reference, valid, fresh, samples, changes, flags, research: fresh && flags.length === 0 && week != null && week >= -5 && week <= 15 && month != null && month >= -10 && month <= 25 };
}

export interface OfferInput {
  analysis: MarketAnalysis; asking: string; quantity: number; currency: string;
  fx: { date: string; rates: Record<string, number> }; target: string; confirmed: boolean; custom: boolean;
}
export function assessOffer(input: OfferInput) {
  const { analysis, quantity, currency, fx } = input;
  const asking = parseAmount(input.asking), target = parseAmount(input.target);
  const market = analysis.valid ? exchange(analysis.reference.amount, analysis.reference.currency, currency, fx) : null;
  const unitAsking = asking !== null && Number.isInteger(quantity) && quantity > 0 && quantity <= 999 ? asking / quantity : null;
  const reasons: string[] = [];
  if (unitAsking === null || unitAsking <= 0) reasons.push('Enter a positive seller asking price in the calculator above.');
  if (market === null || market <= 0) reasons.push('A matching market price and exchange rate are required.');
  if (target === null || target < 1 || target > 100) reasons.push('Set your buy target between 1% and 100%.');
  if (currency !== analysis.reference.currency && fx.date === 'fallback') reasons.push('Exchange rates are estimated. Verify the conversion before deciding.');
  if (input.custom) reasons.push('This is a manual or adjusted value. Use matching condition or graded sold comparisons; the catalog trend is for the raw card.');
  if (!input.confirmed) reasons.push('Confirm the exact printing, variant and comparable raw condition first.');
  reasons.push(...analysis.flags.map((flag) => flag.message));
  const percent = market !== null && market > 0 && unitAsking !== null ? unitAsking / market * 100 : null;
  const targetPrice = market !== null && target !== null && target >= 1 && target <= 100 ? Math.round(market * target) / 100 : null;
  let verdict: 'good' | 'negotiate' | 'pass' | 'check' = 'check';
  if (!reasons.length && percent !== null && target !== null) {
    verdict = percent > 100 ? 'pass' : percent <= target + 1e-9 ? 'good' : 'negotiate';
    reasons.push(verdict === 'good' ? 'The asking price meets your buy target and the available history has no sharp-move flags.' : verdict === 'pass' ? 'The seller is asking above the matching catalog market reference.' : 'The price is below or at market, but above your chosen buy target.');
  }
  return { verdict, reasons, market, unitAsking, percent, targetPrice, headroom: market !== null && unitAsking !== null ? market - unitAsking : null };
}

export function screenMarket<T extends { key: string; analysis: MarketAnalysis }>(entries: T[], period: MarketPeriod) {
  const eligible = entries.filter((entry) => entry.analysis.fresh && entry.analysis.changes[period]);
  const movement = (entry: T) => entry.analysis.changes[period]!.percent;
  return {
    gainers: eligible.filter((entry) => movement(entry) > 0).sort((a, b) => movement(b) - movement(a) || a.key.localeCompare(b.key)),
    decliners: eligible.filter((entry) => movement(entry) < 0).sort((a, b) => movement(a) - movement(b) || a.key.localeCompare(b.key)),
    research: entries.filter((entry) => entry.analysis.research).sort((a, b) => (b.analysis.changes[30]?.percent ?? 0) - (a.analysis.changes[30]?.percent ?? 0) || a.key.localeCompare(b.key)),
    caution: entries.filter((entry) => entry.analysis.flags.length).sort((a, b) => Number(b.analysis.flags.some((f) => f.code === 'spike' || f.code === 'decline')) - Number(a.analysis.flags.some((f) => f.code === 'spike' || f.code === 'decline')) || Math.abs(movementSafe(b, period)) - Math.abs(movementSafe(a, period)) || a.key.localeCompare(b.key)),
  };
}
function movementSafe(entry: { analysis: MarketAnalysis }, period: MarketPeriod) { return entry.analysis.changes[period]?.percent ?? 0; }

export interface MarketEntry {
  key: string; id: string; name: string; setName: string | null; cardNumber: string | null; language: string;
  imageUrl: string | null; analysis: MarketAnalysis;
}
