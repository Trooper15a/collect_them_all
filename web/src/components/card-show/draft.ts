import { z } from 'zod';
import { CURRENCIES, type CardSummary, type Currency, variantLabel } from '@/lib/types';
import { exchange, parseAmount } from '@/lib/card-show';
import type { Rates } from '@/lib/fx';

const text = z.string().max(40);
const priceOption = z.object({
  label: z.string().max(180), value: text, currency: z.enum(CURRENCIES), updatedAt: z.string().max(80).nullable(),
});
const cardSchema = z.object({
  key: z.string().max(100), id: z.string().max(100).nullable(), name: z.string().max(240), detail: z.string().max(400),
  value: text, currency: z.enum(CURRENCIES), quantity: z.number().int().min(1).max(999),
  options: z.array(priceOption).max(100), optionIndex: z.number().int().min(0).max(100), custom: z.boolean(), notes: z.string().max(240),
});
const basketSchema = z.object({ cards: z.array(cardSchema).max(100), cash: text, rate: text });
const draftSchema = z.object({
  version: z.literal(1), mode: z.enum(['buy', 'sell', 'trade']), currency: z.enum(CURRENCIES), target: text,
  buy: basketSchema, sell: basketSchema, giving: basketSchema, getting: basketSchema,
});
export type ShowCard = z.infer<typeof cardSchema>;
export type Basket = z.infer<typeof basketSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Side = 'buy' | 'sell' | 'giving' | 'getting';

export function createDraft(currency: Currency): Draft {
  const basket = (): Basket => ({ cards: [], cash: '', rate: '100' });
  return { version: 1, mode: 'buy', currency, target: '80', buy: basket(), sell: basket(), giving: basket(), getting: basket() };
}

export function readDraft(raw: string | null): Draft | null {
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const result = draftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch { return null; }
}

export function catalogCard(card: CardSummary): ShowCard {
  const options: ShowCard['options'] = [];
  for (const source of ['tcgplayer', 'cardmarket'] as const) {
    const market = card.prices?.[source];
    if (!market) continue;
    for (const [variant, price] of Object.entries(market.variants ?? {})) {
      const metrics = [['market', price.market], ['trend', price.trend], ['7-day average', price.avg7], ['mid', price.mid], ['low', price.low]] as const;
      const metric = metrics.find(([, amount]) => typeof amount === 'number' && Number.isFinite(amount) && amount > 0);
      if (!metric || metric[1] == null) continue;
      options.push({
        label: `${source === 'tcgplayer' ? 'TCGPlayer' : 'Cardmarket'} · ${variantLabel(variant)} · ${metric[0]}`,
        value: metric[1].toFixed(2), currency: market.currency, updatedAt: market.updatedAt ?? null,
      });
    }
  }
  return {
    key: crypto.randomUUID(), id: card.id, name: card.name,
    detail: [card.setName, card.cardNumber ? `#${card.cardNumber}` : '', card.language === 'jap' ? 'Japanese' : card.language === 'eng' ? 'English' : card.language].filter(Boolean).join(' · '),
    value: options[0]?.value ?? '', currency: options[0]?.currency ?? 'USD', quantity: 1,
    options, optionIndex: 0, custom: !options.length, notes: '',
  };
}

export function changeCurrency(draft: Draft, currency: Currency, fx: Rates): Draft | null {
  const next = { ...draft, currency };
  for (const side of ['buy', 'sell', 'giving', 'getting'] as const) {
    const basket = draft[side];
    if (basket.cash === '') { next[side] = { ...basket }; continue; }
    const amount = parseAmount(basket.cash);
    const converted = amount === null ? null : exchange(amount, draft.currency, currency, fx);
    if (converted === null || converted > 1_000_000_000) return null;
    next[side] = { ...basket, cash: converted.toFixed(2) };
  }
  return next;
}
