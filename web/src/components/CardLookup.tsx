'use client';
import { languageOptions } from "@/lib/languages";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LookupTabs } from '@/components/LookupTabs';
import { CardImage, Field, inputCls, Money, TcgBadge } from '@/components/ui';
import { useActiveTcgHydrated } from '@/lib/ui-prefs';
import { langLabel } from '@/lib/format';
import type { CardSummary } from '@/lib/types';

export function CardLookup() {
  const { tcg, hydrated } = useActiveTcgHydrated();
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('all');
  const [retry, setRetry] = useState(0);
  const [resource, setResource] = useState<{ key: string; cards?: CardSummary[]; warnings?: string[]; error?: string } | null>(null);
  const search = query.trim();
  const key = new URLSearchParams({ q: search, tcg, lang: language, limit: '60' }).toString();
  useEffect(() => {
    if (!hydrated || search.length < 2) return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`/api/search?${key}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error('Card search is temporarily unavailable.');
        if (!cancelled) setResource({ key, cards: Array.isArray(data.cards) ? data.cards.slice(0, 60) : [], warnings: Array.isArray(data.warnings) ? data.warnings : [] });
      } catch (cause) {
        if (!cancelled) setResource({ key, error: controller.signal.aborted ? 'Search took too long. Please retry.' : cause instanceof Error ? cause.message : 'Could not search cards.' });
      } finally { clearTimeout(timeout); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [hydrated, search, key, retry]);
  const result = search.length >= 2 && resource?.key === key ? resource : null;

  return <div className="py-6 space-y-4">
    <header><p className="text-[10px] text-accent uppercase tracking-[0.22em] font-semibold">Explore the catalog</p><h1 className="text-3xl font-bold tracking-tight mt-2">Card Lookup</h1><p className="text-xs text-muted mt-2">Find any imported card by name, set, number or rarity. You don’t need to own it.</p></header>
    <LookupTabs active="cards" />
    <section aria-label="Card search filters" className="card-surface rounded-2xl p-4 space-y-3">
      <Field label="Search cards"><input className={inputCls} value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="e.g. Charizard 151 or Pikachu promo" autoComplete="off" /></Field>
      <div className="flex gap-3 items-end"><Field label="Language"><select className={`${inputCls} text-xs`} value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{languageOptions(tcg).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field><p className="text-[11px] text-muted pb-3">Uses the selected game. For Chinese or Korean Pokémon, choose its language and search by native name, set code or number.</p></div>
    </section>
    {search.length < 2 ? <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted text-center">Enter at least two characters to find cards across the catalog.</div>
      : result?.error ? <div role="alert" className="rounded-xl border border-down/30 p-4 text-sm"><p>{result.error}</p><button type="button" className="text-accent underline mt-3" onClick={() => { setResource(null); setRetry((value) => value + 1); }}>Retry card search</button></div>
      : !result?.cards ? <p role="status" className="text-sm text-muted py-6">Searching cards…</p>
      : <>
        {result.warnings?.map((warning) => <p key={warning} role="status" className="text-xs text-muted">{warning}</p>)}
        <p role="status" className="text-xs text-muted">{result.cards.length === 60 ? 'Showing the first 60 results. Add a set or number to narrow your search.' : `${result.cards.length} matching cards`}</p>
        {!result.cards.length && <div className="card-surface rounded-xl p-5 text-sm text-muted">No cards found. Try another name, set, number, language or game. Missing sets can be imported in <Link href="/settings" className="text-accent underline">Settings</Link>.</div>}
        <ul className="grid sm:grid-cols-2 gap-3">{result.cards.map((card) => {
          const price = card.display ?? card.price;
          return <li key={card.id}><Link href={`/cards/${encodeURIComponent(card.id)}`} className="card-surface rounded-2xl p-3 flex gap-3 h-full hover:border-accent/40"><CardImage id={card.id} directUrl={card.imageUrl} alt="" className="w-14 rounded-lg shrink-0" /><div className="min-w-0 flex-1"><TcgBadge tcg={card.tcg} /><h2 className="text-sm font-semibold mt-1 leading-snug">{card.name}</h2><p className="text-[11px] text-muted mt-1">{card.setName ?? 'Unknown set'} · #{card.cardNumber ?? '—'} · {langLabel(card.language)}</p><p className="text-xs mt-2 font-semibold">{price ? <Money amount={price.amount} currency={price.currency} /> : <span className="text-muted">No price available</span>}</p></div><span aria-hidden className="text-muted self-center">›</span></Link></li>;
        })}</ul>
      </>}
  </div>;
}
