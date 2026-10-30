'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CardImage, inputCls, Money } from '@/components/ui';
import { useActiveTcg } from '@/lib/ui-prefs';
import { exchange } from '@/lib/card-show';
import type { CardSummary, Currency } from '@/lib/types';
import type { Rates } from '@/lib/fx';

export function CardSearch({ onAdd, currency, fx, label }: { onAdd: (card: CardSummary) => void; currency: Currency; fx: Rates; label: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CardSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const tcg = useActiveTcg();
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const select = (card: CardSummary) => {
    request.current?.abort();
    onAdd(card); setQuery(''); setResults([]); setOpen(false); setStatus('idle');
  };

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(async () => {
      setResults([]); setWarnings([]);
      if (query.trim().length < 2) { setStatus('idle'); return; }
      setStatus('loading');
      try {
        const response = await fetch(`/api/search?${new URLSearchParams({ q: query.trim(), tcg, limit: '12' })}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();
        if (controller.signal.aborted) return;
        setResults(Array.isArray(data.cards) ? data.cards.slice(0, 12) : []);
        setWarnings(Array.isArray(data.warnings) ? data.warnings.filter((w: unknown) => typeof w === 'string') : []);
        setActive(0); setStatus('done');
      } catch { if (!controller.signal.aborted) setStatus('error'); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, tcg, retry]);

  return (
    <div ref={container} className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} value={query} placeholder="Search name, set or card number…" autoComplete="off" className={inputCls}
        role="combobox" aria-autocomplete="list" aria-controls={`${id}-results`} aria-expanded={open && query.trim().length >= 2}
        aria-activedescendant={open && results[active] ? `${id}-option-${active}` : undefined}
        onFocus={() => setOpen(true)} onChange={(e) => { request.current?.abort(); setQuery(e.target.value); setResults([]); setStatus('idle'); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, results.length - 1)); }
          if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
          if (e.key === 'Enter' && open && results[active]) { e.preventDefault(); select(results[active]); }
        }} />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-line bg-elev shadow-xl max-h-80 overflow-y-auto">
          <div role="status" className="text-xs text-muted">
            {(status === 'loading' || status === 'idle') && <p className="p-4">Searching cards…</p>}
            {status === 'done' && !results.length && <p className="p-4">No cards found. Try a set or number, or add a manual card below.</p>}
            {status === 'error' && <p className="p-4">Search unavailable. <button type="button" className="underline text-accent" onClick={() => setRetry((n) => n + 1)}>Retry search</button> or add a manual card.</p>}
            {warnings.map((warning) => <p key={warning} className="px-4 py-2">{warning}</p>)}
          </div>
          <ul id={`${id}-results`} role="listbox" aria-label="Matching cards">
            {results.map((card, index) => {
              const amount = card.price ? exchange(card.price.amount, card.price.currency, currency, fx) : null;
              return <li key={card.id} role="presentation"><button id={`${id}-option-${index}`} role="option" aria-selected={active === index} type="button" onClick={() => select(card)} className={`flex items-center gap-3 text-left w-full p-3 hover:bg-accent/10 ${active === index ? 'bg-accent/10' : ''}`}>
                <CardImage id={card.id} className="w-9 rounded shrink-0" alt="" />
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{card.name}</span><span className="block text-xs text-muted truncate">{card.setName} · #{card.cardNumber ?? '—'} · {card.language}</span></span>
                <span className="text-xs shrink-0">{amount === null ? 'Set value' : <Money amount={amount} currency={currency} />}</span>
              </button></li>;
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
