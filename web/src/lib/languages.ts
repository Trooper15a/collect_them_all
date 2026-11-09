export const CARD_LANGUAGES = ['eng', 'jap', 'zh-cn', 'zh-tw', 'kor'] as const;
export type CardLanguage = typeof CARD_LANGUAGES[number];
export type LanguageFilter = CardLanguage | 'all';
export const EXTRA_POKEMON_LANGUAGES = ['zh-cn', 'zh-tw', 'kor'] as const;
export type ExtraPokemonLanguage = typeof EXTRA_POKEMON_LANGUAGES[number];
const OPTIONS = [
  { value: 'eng' as const, label: 'English' },
  { value: 'jap' as const, label: 'Japanese' },
  { value: 'zh-cn' as const, label: 'Chinese (Simplified)' },
  { value: 'zh-tw' as const, label: 'Chinese (Traditional)' },
  { value: 'kor' as const, label: 'Korean' },
];
export function languageOptions(tcg: string) { return tcg === 'pokemon' || tcg === 'all' || !tcg ? OPTIONS : OPTIONS.slice(0, 2); }
export function isExtraPokemonLanguage(lang: string): lang is ExtraPokemonLanguage { return EXTRA_POKEMON_LANGUAGES.some(l => l === lang); }
export function cardLanguageName(lang: string) { return OPTIONS.find(o => o.value === lang)?.label ?? lang.toUpperCase(); }
export function normalizeCardLanguage(value: string | null): CardLanguage | null {
  const s = value?.trim().toLowerCase();
  if (!s) return null;
  if (['zh-tw','zh-hant','traditional chinese','chinese (traditional)','繁體中文','繁体中文','tw'].includes(s)) return 'zh-tw';
  if (['zh-cn','zh-hans','simplified chinese','chinese (simplified)','简体中文','簡體中文','cn','chn','chinese'].includes(s)) return 'zh-cn';
  if (['ko','kor','kr','korean','한국어'].includes(s)) return 'kor';
  if (/^(jap|jp|ja|japanese|日本)/.test(s)) return 'jap';
  if (/^(eng|en|english)/.test(s)) return 'eng';
  return null;
}
