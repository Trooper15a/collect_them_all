import { cached } from './cache';
import type { NormalizedCard } from './types';
import type { ExtraPokemonLanguage } from './languages';
const apiLanguage = (lang: ExtraPokemonLanguage) => lang === 'kor' ? 'ko' : lang;
interface DexBrief { id: string; name: string; localId?: string; image?: string }
export interface DexSet extends DexBrief { cardCount?: { total: number }; releaseDate?: string; cards?: DexBrief[] }
interface DexCard extends DexBrief { set: { id: string; name: string }; rarity?: string }
async function request<T>(lang: ExtraPokemonLanguage, path: string): Promise<T> {
  return cached(`tcgdex:${lang}:${path}`, 86400, async () => {
    const response = await fetch(`https://api.tcgdex.net/v2/${apiLanguage(lang)}/${path}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Pokémon catalog unavailable (${response.status})`);
    return response.json() as Promise<T>;
  });
}
export function dexSets(lang: ExtraPokemonLanguage) { return request<DexSet[]>(lang, 'sets'); }
export function normalizeDexCard(card: DexCard, lang: ExtraPokemonLanguage): NormalizedCard {
  return { id: `td:${lang}:${card.id}`, sourceId: card.id, tcg: 'pokemon', language: lang, name: card.name,
    setCode: card.set.id, setId: `pokemon:${card.set.id}:${lang}`, setName: card.set.name,
    cardNumber: card.localId ?? card.id.slice(card.id.lastIndexOf('-') + 1), rarity: card.rarity ?? null,
    imageUrl: card.image ? `${card.image}/high.webp` : null, prices: {}, meta: { catalog: 'TCGdex' } };
}
export async function dexSetCards(lang: ExtraPokemonLanguage, code: string) {
  const set = await request<DexSet>(lang, `sets/${encodeURIComponent(code)}`);
  return (set.cards ?? []).map(card => normalizeDexCard({ ...card, set }, lang));
}
export async function dexSearch(lang: ExtraPokemonLanguage, query: string, limit: number) {
  const index = await request<DexBrief[]>(lang, 'cards');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = index.filter(c => words.every(w => `${c.name} ${c.id} ${c.localId ?? ''}`.toLowerCase().includes(w))).slice(0, Math.min(limit, 24));
  const cards: NormalizedCard[] = [];
  // Bound concurrency for upstream requests.
  for (let i = 0; i < matches.length; i += 6) {
    cards.push(...await Promise.all(matches.slice(i, i + 6).map(async c => normalizeDexCard(await request<DexCard>(lang, `cards/${encodeURIComponent(c.id)}`), lang))));
  }
  return cards;
}
