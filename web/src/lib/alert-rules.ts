import type { CardPrices } from "./types";

export type AlertDirection = "drop" | "rise" | "either";

/** Native quote for this finish and, when supplied, this currency only. */
export function alertQuote(prices: CardPrices | null | undefined, variant: string, currency?: string | null) {
  for (const market of ["tcgplayer", "cardmarket"] as const) {
    const source = prices?.[market];
    if (!source || !["USD", "EUR"].includes(source.currency) || (currency && source.currency !== currency)) continue;
    const price = source.variants?.[variant];
    const amount = price?.market ?? price?.trend ?? price?.avg7 ?? price?.mid ?? price?.low;
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) return { amount, currency: source.currency, variant, market };
  }
  return null;
}

export function evaluateAlert(base: number | null, baseCurrency: string | null, current: { amount: number; currency: string } | null, threshold: number, direction: AlertDirection = "either") {
  if (!base || !Number.isFinite(base) || base <= 0 || !baseCurrency || !current || current.currency !== baseCurrency || !Number.isFinite(current.amount) || current.amount <= 0) return { changePct: null, triggered: false };
  const changePct = ((current.amount - base) / base) * 100;
  const triggered = direction === "drop" ? changePct <= -threshold : direction === "rise" ? changePct >= threshold : Math.abs(changePct) >= threshold;
  return { changePct, triggered };
}
