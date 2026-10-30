/** Pure calculations for show offers. null means incomplete, never a free card. */
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function parseAmount(value: string): number | null {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount <= 1_000_000_000 ? amount : null;
}

export function exchange(amount: number, from: string, to: string, fx: { rates: Record<string, number> }): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (from === to) return cents(amount);
  const source = fx.rates[from], target = fx.rates[to];
  if (!(source > 0) || !(target > 0) || !Number.isFinite(source) || !Number.isFinite(target)) return null;
  return cents(amount / source * target);
}

export function totalCards(cards: { value: string; currency: string; quantity: number }[], currency: string, fx: { rates: Record<string, number> }): number | null {
  if (!cards.length) return null;
  let total = 0;
  for (const card of cards) {
    const value = parseAmount(card.value);
    if (value === null || value <= 0 || !Number.isInteger(card.quantity) || card.quantity < 1 || card.quantity > 999) return null;
    const converted = exchange(value * card.quantity, card.currency, currency, fx);
    if (converted === null) return null;
    total += converted;
  }
  return cents(total);
}

export function evaluateCash(market: number | null, offerText: string, targetText: string, mode: 'buy' | 'sell') {
  const offer = parseAmount(offerText), percentTarget = parseAmount(targetText);
  if (market === null || !Number.isFinite(market) || market <= 0 || offer === null || percentTarget === null || percentTarget < 1 || percentTarget > 100) return null;
  const percent = offer / market * 100;
  const target = cents(market * percentTarget / 100);
  const advantage = cents(mode === 'buy' ? target - offer : offer - target);
  const tone = advantage >= 0 ? 'good' : (mode === 'buy' ? percent > 90 : percent < 70) ? 'bad' : 'caution';
  return { offer, percent, target, advantage, low: cents(market * 0.7), high: cents(market * 0.9), tone };
}

function tradeResult(giving: number, getting: number) {
  giving = cents(giving);
  getting = cents(getting);
  const difference = cents(getting - giving);
  const percent = Math.max(giving, getting) > 0 ? difference / Math.max(giving, getting) * 100 : 0;
  const verdict = Math.abs(percent) <= 5 ? 'balanced' : difference > 0 ? 'ahead' : 'behind';
  return { giving, getting, difference, percent, verdict };
}

export function evaluateTrade(giveMarket: number | null, getMarket: number | null, giveCashText: string, getCashText: string, giveRateText: string, getRateText: string) {
  const giveCash = parseAmount(giveCashText === '' ? '0' : giveCashText);
  const getCash = parseAmount(getCashText === '' ? '0' : getCashText);
  const giveRate = parseAmount(giveRateText), getRate = parseAmount(getRateText);
  if (giveMarket === null || getMarket === null || !Number.isFinite(giveMarket) || !Number.isFinite(getMarket) || giveMarket < 0 || getMarket < 0 || giveCash === null || getCash === null || giveRate === null || getRate === null || giveRate < 1 || giveRate > 200 || getRate < 1 || getRate > 200) return null;
  if (giveMarket + giveCash <= 0 || getMarket + getCash <= 0) return null;
  return {
    market: tradeResult(giveMarket + giveCash, getMarket + getCash),
    negotiated: tradeResult(giveMarket * giveRate / 100 + giveCash, getMarket * getRate / 100 + getCash),
  };
}
