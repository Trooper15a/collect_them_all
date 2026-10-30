import { getCard } from '@/lib/cards';
import { resolveScanId } from '@/lib/resolve';
import { isScanIndexId } from '@/lib/scanner/matcher';
import { localShowCard } from '@/lib/card-show-local-catalog';
import { bestPrice, type CardSummary, type NormalizedCard } from '@/lib/types';

function summary(card: NormalizedCard): CardSummary {
  const price = bestPrice(card.prices);
  return { id: card.id, tcg: card.tcg, name: card.name, setName: card.setName, setCode: card.setCode,
    cardNumber: card.cardNumber, rarity: card.rarity, language: card.language, imageUrl: card.imageUrl,
    price: price ? { amount: price.amount, currency: price.currency, variant: price.variant } : null, prices: card.prices };
}

export async function lookupShowCard(id: string): Promise<{ card: CardSummary; warning: string | null } | null> {
  try {
    const card = isScanIndexId(id) ? (await resolveScanId(id)).card : await getCard(id);
    if (card) return { card: summary(card), warning: null };
  } catch { /* Local preview can still use its read-only catalog snapshot. */ }
  const saved = await localShowCard(id);
  return saved ? { card: summary(saved), warning: 'Using a saved catalog price. Check its update date before agreeing to a deal.' } : null;
}
