import { GRADE_MULT } from "./grades";
import { bestPrice, type CardPrices, type NormalizedCard } from "./types";

const CONDITION_MULT: Record<string, number> = { NM: 1, LP: 0.85, MP: 0.7, HP: 0.5, DMG: 0.35 };

/** Value exactly one saved finish; a missing quote never substitutes another finish. */
export function unitValue(card: NormalizedCard, variant: string, condition: string, isGraded: boolean, gradingCompany: string | null, grade: string | null) {
  const bp = bestPrice(card.prices, variant);
  if (!bp) return null;
  let mult = isGraded ? (GRADE_MULT[`${gradingCompany} ${grade}`] ?? 1) : (CONDITION_MULT[condition] ?? 1);
  if (!Number.isFinite(mult)) mult = 1;
  return { amount: bp.amount * mult, currency: bp.currency, variant: bp.variant, raw: bp.amount };
}

/** Catalog browsing starts with Normal when priced, then the first available quote. */
export function defaultVariant(prices: CardPrices): string {
  return bestPrice(prices, "normal")?.variant ?? bestPrice(prices)?.variant
    ?? Object.keys(prices.tcgplayer?.variants ?? {})[0] ?? Object.keys(prices.cardmarket?.variants ?? {})[0] ?? "normal";
}

export interface OwnedCopy {
  id: number;
  portfolioId: number;
  portfolioName: string;
  quantity: number;
  variantType: string;
  condition: string;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
}
