import type { NormalizedCard } from './types';
import type { IndexCard } from './scanner/matcher';

/** Never guess a price from a different printing with the same character name. */
export function chooseLocalPrinting(cards: NormalizedCard[], scan: IndexCard): NormalizedCard | null {
  const normalize = (value: string | null | undefined) => (value ?? '').normalize('NFKC').trim().toLowerCase();
  const number = (value: string | null | undefined) => normalize(value).split('/')[0].replace(/^0+(?=\d)/, '');
  const language = scan.lang === 'en' ? 'eng' : scan.lang === 'ja' ? 'jap' : scan.lang;
  if (!scan.num || (!scan.set && !scan.setName) || !language || !scan.tcg) return null;
  const exact = cards.filter((card) => card.tcg === scan.tcg && card.language === language && number(card.cardNumber) === number(scan.num)
    && ((!!scan.set && normalize(card.setCode) === normalize(scan.set)) || (!!scan.setName && normalize(card.setName) === normalize(scan.setName))));
  return exact.length === 1 ? exact[0] : null;
}
