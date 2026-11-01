'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CardImage, Field, inputCls, Money } from '@/components/ui';
import { exchange } from '@/lib/card-show';
import { CURRENCIES, variantLabel, type Currency } from '@/lib/types';
import { fmtPct, langLabel } from '@/lib/format';
import type { MarketEntry, MarketPeriod, MarketSource } from '@/lib/investing';
import type { Rates } from '@/lib/fx';
import { useHidePrices } from '@/lib/ui-prefs';

const views = [
  { key: 'gainers', title: 'Biggest gainers', hint: 'The strongest rises in your selected period. A big rise can also be a reason to wait.' },
  { key: 'decliners', title: 'Biggest decliners', hint: 'The largest drops. A lower price alone does not make a card undervalued.' },
  { key: 'research', title: 'Worth researching', hint: 'Fresh prices, usable history and moderate movement. Check the actual asking price in Card Show.' },
  { key: 'caution', title: 'What to avoid', hint: 'Sharp rises, sharp declines or weak data. These flags explain when to slow down and verify a deal.' },
] as const;
type View = (typeof views)[number]['key'];
export interface MarketResponse {
  lists: Record<View, MarketEntry[]>; counts: Record<View, number>;
  catalogCount: number; filteredCount: number; comparableCount: number; freshCount?: number; fx: Rates; asOf: string;
}

export function Investing({ initialCurrency = 'USD' }: { initialCurrency?: Currency }) {
  const [view, setView] = useState<View>('gainers');
  const [days, setDays] = useState<MarketPeriod>(7);
  const [source, setSource] = useState<MarketSource>('tcgplayer');
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [language, setLanguage] = useState('all');
  const [min, setMin] = useState('5');
  const [max, setMax] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [retry, setRetry] = useState(0);
  const [resource, setResource] = useState<{ key: string; data?: MarketResponse; error?: string } | null>(null);
  const hidden = useHidePrices();
  const params = new URLSearchParams({ days: String(days), source, currency, language, min: min || '0', q: query, limit: String(limit) });
  if (max) params.set('max', max);
  const requestKey = params.toString();
  const invalid = (min !== '' && (!Number.isFinite(Number(min)) || Number(min) < 0))
    || (max !== '' && (!Number.isFinite(Number(max)) || Number(max) < Number(min || 0)));
  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(new DOMException('Market request timed out', 'TimeoutError')), 30_000);
      try {
        const response = await fetch(`/api/investing?${requestKey}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load market data.');
        if (!controller.signal.aborted) setResource({ key: requestKey, data });
      } catch (error) {
        if (!controller.signal.aborted) setResource({ key: requestKey, error: error instanceof Error ? error.message : 'Could not load market data.' });
        else if (controller.signal.reason?.name === 'TimeoutError') setResource({ key: requestKey, error: 'Market data took too long. Please retry.' });
      } finally { clearTimeout(timeout); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, invalid, retry]);
  const data = resource?.key === requestKey && !invalid ? resource.data : undefined;
  const error = resource?.key === requestKey && !invalid ? resource.error : undefined;
  const active = views.find((item) => item.key === view)!;

  return <div className="py-6 space-y-5">
    <header className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-accent">Pokémon market radar</p>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Card Investing</h1>
      <p className="text-sm text-muted max-w-xl leading-relaxed">Find what’s moving. Understand the risk. Check the price before you buy.</p>
      <Link href="/card-show" className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-xs font-semibold text-accent">At a card show? Check a seller’s offer <span aria-hidden>↗</span></Link>
    </header>

    <section aria-label="Market filters" className="card-surface rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Explore Pokémon singles</h2>
        <div role="group" aria-label="Movement period" className="inline-flex rounded-lg border border-line p-1">
          {([7, 30, 90] as const).map((period) => <button key={period} type="button" aria-pressed={days === period} onClick={() => setDays(period)} className={`rounded-md px-3 py-2 text-xs font-semibold ${period === days ? 'bg-accent text-bg' : 'text-muted'}`}>{period}D</button>)}
        </div>
      </div>
      <Field label="Find a card or set"><input className={inputCls} value={query} maxLength={120} placeholder="Charizard, 151, card number…" onChange={(event) => setQuery(event.target.value)} /></Field>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Source, language &amp; budget <span className="text-fg">· {source === 'tcgplayer' ? 'TCGPlayer' : 'Cardmarket'} · {currency}</span></summary>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <Field label="Market source"><select className={`${inputCls} text-xs`} value={source} onChange={(event) => setSource(event.target.value as MarketSource)}><option value="tcgplayer">TCGPlayer</option><option value="cardmarket">Cardmarket</option></select></Field>
        <Field label="Card language"><select className={`${inputCls} text-xs`} value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option><option value="eng">English</option><option value="jap">Japanese</option></select></Field>
        <Field label="Display currency"><select className={`${inputCls} text-xs`} value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>{CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></Field>
        <Field label={`Minimum price (${currency})`}><input className={inputCls} inputMode="decimal" value={min} maxLength={20} placeholder="0" onChange={(event) => setMin(event.target.value)} /></Field>
        <Field label={`Maximum price (${currency})`}><input className={inputCls} inputMode="decimal" value={max} maxLength={20} placeholder="Any price" onChange={(event) => setMax(event.target.value)} /></Field>
        </div>
      </details>
      {invalid && <p role="alert" className="text-xs text-down">Enter a valid price range. Maximum must be at least minimum.</p>}
      <p className="text-[11px] text-muted">Defaults to cards worth at least {currency} 5 to reduce tiny-price noise. Movement is calculated in the source currency.</p>
    </section>

    <div role="group" aria-label="Market lists" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {views.map((item) => <button type="button" key={item.key} aria-pressed={view === item.key} onClick={() => setView(item.key)} className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold ${view === item.key ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted'}`}>{item.title}{data && <span className="block mt-1 text-[10px] font-normal">{hidden ? '•••' : data.counts[item.key].toLocaleString()} references</span>}</button>)}
    </div>
    <section aria-label={active.title} className="space-y-3">
      <div><h2 className="text-lg font-semibold">{active.title}</h2><p className="text-xs text-muted mt-1 leading-relaxed">{active.hint}</p></div>
      {hidden ? <div className="card-surface rounded-xl p-5 text-sm text-muted">Prices are hidden. Turn off Hide prices in Settings to view market movements and signals.</div>
        : error ? <div role="alert" className="rounded-xl border border-down/30 p-4 text-sm"><p>{error}</p><button type="button" className="mt-3 text-accent underline" onClick={() => { setResource(null); setRetry((value) => value + 1); }}>Retry market data</button></div>
        : !data && !invalid ? <div role="status" className="card-surface rounded-xl p-6 text-sm text-muted">Reading the Pokémon market…</div>
        : data && <>
          <p className="text-[11px] text-muted">{data.filteredCount.toLocaleString()} matching references · {data.comparableCount.toLocaleString()} with a fresh {days}-day comparison · entire imported Pokémon catalog, including cards you don’t own</p>
          {data.freshCount === 0 && data.filteredCount > 0 && <p role="status" className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-amber-400 leading-relaxed">No fresh prices match these filters. Refresh Pokémon prices in <Link href="/settings" className="underline">Settings</Link>. Gainers, decliners and the research shortlist need current prices and usable history; older references are listed under What to avoid.</p>}
          {!data.catalogCount ? <div className="card-surface rounded-xl p-5 text-sm text-muted space-y-2"><p>No Pokémon market references are available for this source yet.</p><p>Import Pokémon prices in <Link href="/settings" className="text-accent underline">Settings</Link>, or try the other market source. History builds as prices are imported.</p></div>
            : !data.lists[view].length ? <div className="card-surface rounded-xl p-5 text-sm text-muted">No cards meet these filters and data requirements. Try another period or source, widen your budget, or check What to avoid for limited-history cards.</div>
            : <div className="space-y-3">{data.lists[view].map((entry, index) => <MarketCard key={entry.key} entry={entry} rank={index + 1} period={days} currency={currency} fx={data.fx} />)}</div>}
          {data.counts[view] > data.lists[view].length && <div className="flex items-center justify-between text-xs text-muted gap-3"><p>Showing the top {data.lists[view].length} of {data.counts[view].toLocaleString()}.</p>{limit < 60 && <button type="button" className="rounded-lg border border-line px-4 py-2 text-accent" onClick={() => setLimit((value) => Math.min(60, value + 20))}>Show more</button>}</div>}
          {data.fx.date === 'fallback' && <p className="text-xs text-amber-400">Converted prices and budget filters use estimated exchange rates. Verify conversions before buying.</p>}
        </>}
    </section>
    <details className="card-surface rounded-xl p-4 text-xs text-muted leading-relaxed">
      <summary className="cursor-pointer font-semibold text-fg">How these signals work</summary>
      <div className="mt-3 space-y-2">
        <p>Gainers and decliners rank percentage changes for the selected period. Each comparison uses the exact source, printing and variant. A baseline may be up to six days before the requested date; its actual date is shown. Missing history stays blank.</p>
        <p>Research shortlist: price updated within 72 hours, at least five observations, a 30-day baseline, seven-day movement from −5% to +15%, and 30-day movement from −10% to +25%. These are screening rules, not tested forecasts.</p>
        <p>Caution flags: a rise of 20% in seven days or 40% in 30 days; a fall of 10% in seven days or 20% in 30 days; stale prices; or limited history. “What to avoid” means avoid acting on an unchecked signal.</p>
        <p>Data covers imported Pokémon singles and available market prices. TCGPlayer Market Price reflects recent completed sales; listed lows and medians do not qualify. We do not have sales volume, liquidity or verified reprint data. Raw catalog prices do not value graded cards. Fees, condition and your entry price matter; past movement does not predict returns.</p>
        <a href="https://help.tcgplayer.com/hc/en-us/articles/213588017-TCGplayer-Market-Price" target="_blank" rel="noreferrer" className="inline-block text-accent underline">TCGPlayer Market Price methodology ↗</a>
      </div>
    </details>
  </div>;
}

function MarketCard({ entry, rank, period, currency, fx }: { entry: MarketEntry; rank: number; period: MarketPeriod; currency: Currency; fx: Rates }) {
  const { analysis } = entry;
  const reference = analysis.reference;
  const change = analysis.changes[period];
  const money = exchange(reference.amount, reference.currency, currency, fx);
  const offerUrl = `/card-show?${new URLSearchParams({ card: entry.id, market: reference.source, variant: reference.variant })}`;
  return <article className="card-surface rounded-2xl p-4 space-y-3">
    <div className="flex gap-3 items-start">
      <div className="relative shrink-0"><CardImage id={entry.id} directUrl={entry.imageUrl} alt="" className="w-14 rounded-lg" /><span className="absolute -top-1 -left-1 text-[10px] bg-elev border border-line rounded-md px-1.5 py-0.5">{rank}</span></div>
      <div className="flex-1 min-w-0"><Link href={`/cards/${encodeURIComponent(entry.id)}`} className="text-sm font-semibold leading-snug hover:text-accent">{entry.name}</Link><p className="text-[11px] text-muted mt-1">{entry.setName ?? 'Unknown set'} · #{entry.cardNumber ?? '—'} · {langLabel(entry.language)}</p><p className="text-[11px] text-muted mt-1">{variantLabel(reference.variant)} · {reference.source === 'tcgplayer' ? 'TCGPlayer' : 'Cardmarket'}</p></div>
      <div className="text-right shrink-0"><p className="text-base font-bold"><Money amount={money} currency={currency} /></p><p className={`text-xs font-semibold mt-1 ${change && change.percent > 0 ? 'text-up' : change && change.percent < 0 ? 'text-down' : 'text-muted'}`}>{change ? fmtPct(change.percent) : 'No comparison'}</p></div>
    </div>
    <div className="grid grid-cols-3 gap-2 border-y border-line py-3">
      {([7, 30, 90] as const).map((days) => <div key={days}><p className="text-[10px] text-muted">{days}D change</p><p className={`text-xs font-semibold mt-1 ${analysis.changes[days] ? analysis.changes[days]!.percent >= 0 ? 'text-up' : 'text-down' : 'text-muted'}`}>{fmtPct(analysis.changes[days]?.percent)}</p></div>)}
    </div>
    {change && <p className="text-[11px] text-muted">{change.amount >= 0 ? '+' : '−'}<Money amount={exchange(Math.abs(change.amount), reference.currency, currency, fx)} currency={currency} /> since {change.date} · {analysis.samples} observations</p>}
    {analysis.flags.length ? <ul className="space-y-1">{analysis.flags.map((flag) => <li key={flag.code} className="text-xs text-amber-400 leading-relaxed">{flag.message}</li>)}</ul> : <p className="text-xs text-muted">{analysis.research ? 'Moderate movement with usable history. Worth comparing an actual offer.' : 'No sharp-move flags. Check your entry price and matching condition.'}</p>}
    <div className="flex items-center justify-between gap-3"><p className="text-[10px] text-muted">Price dated {reference.updatedAt && Number.isFinite(Date.parse(reference.updatedAt)) ? new Date(reference.updatedAt).toISOString().slice(0, 10) : 'unknown'}</p><Link href={offerUrl} className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-3 py-2 shrink-0">Check an offer ↗</Link></div>
  </article>;
}
