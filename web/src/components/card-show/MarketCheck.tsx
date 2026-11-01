'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PriceChart } from '@/components/PriceChart';
import { Money } from '@/components/ui';
import { assessOffer, type HistoryPoint, type MarketAnalysis } from '@/lib/investing';
import { exchange } from '@/lib/card-show';
import { fmtPct } from '@/lib/format';
import type { Currency } from '@/lib/types';
import type { Rates } from '@/lib/fx';
import { useHidePrices } from '@/lib/ui-prefs';
import type { ShowCard } from './draft';

interface Props { card: ShowCard; asking: string | null; target: string; currency: Currency; fx: Rates }
const titles = { good: 'Good buy on price', negotiate: 'Negotiate', pass: 'Pass at this price', check: 'Check the data first' };

export function MarketCheck(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const hidden = useHidePrices();
  if (hidden) return null;
  const open = props.asking !== null || expanded;
  return <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 space-y-3">
    <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-accent">Is this a good buy?</h3>{props.asking === null && <button type="button" aria-expanded={open} onClick={() => setExpanded((value) => !value)} className="text-xs text-accent underline">{open ? 'Hide market context' : 'Check market context'}</button>}</div>
    {open && <MarketCheckDetails {...props} />}
  </div>;
}

function MarketCheckDetails({ card, asking, target, currency, fx }: Props) {
  const option = card.options[card.optionIndex];
  const [resource, setResource] = useState<{ analyses: MarketAnalysis[]; history: HistoryPoint[] } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!card.id || !option?.source || !option.variant) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), 15_000);
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/investing/card?id=${encodeURIComponent(card.id!)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load market context.');
        if (!cancelled) { setResource(data); setError(''); }
      } catch (cause) {
        if (!cancelled) setError(controller.signal.aborted ? 'Market history took too long. Please retry.' : cause instanceof Error ? cause.message : 'Market context is unavailable.');
      } finally { clearTimeout(timeout); }
    })();
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [card.id, option?.source, option?.variant, retry]);

  if (!card.id || !option?.source || !option.variant) return <p className="text-xs text-muted leading-relaxed">{card.id ? 'Re-add this card from search or a photo to get exact-variant market history. Your saved calculation still works.' : 'Manual and graded entries need matching sold comparisons. The cash calculator above uses your entered value.'}</p>;
  if (error) return <div role="status" className="text-xs text-muted"><p>{error} Your cash comparison still works.</p><button type="button" className="text-accent underline mt-2" onClick={() => { setError(''); setRetry((value) => value + 1); }}>Retry market context</button></div>;
  if (!resource) return <p role="status" className="text-xs text-muted">Checking this exact variant’s market history…</p>;
  const analysis = resource.analyses.find((item) => item.reference.source === option.source && item.reference.variant === option.variant);
  if (!analysis) return <p className="text-xs text-muted">No comparable market-price history for this exact source and variant. Listing lows and medians are not used as market signals.</p>;
  const reference = analysis.reference;
  const result = asking !== null ? assessOffer({ analysis, asking, quantity: card.quantity, currency, fx, target, confirmed, custom: card.custom || option.metric !== 'market' }) : null;
  const color = result?.verdict === 'good' ? 'text-up' : result?.verdict === 'pass' ? 'text-down' : 'text-amber-400';
  const points = resource.history.filter((point) => point.variantType === reference.variant && point.date <= new Date().toISOString().slice(0, 10)).map((point) => {
    const amount = reference.source === 'tcgplayer' ? point.tcgplayerMarket : point.cardmarketAvg;
    return { date: point.date, value: amount !== null && amount > 0 ? exchange(amount, reference.currency, currency, fx) : null };
  }).slice(-100);
  return <div className="space-y-3">
    <div className="flex justify-between items-start gap-3"><div><p className="text-[10px] text-muted">Latest stored raw market reference</p><p className="font-bold text-lg mt-1"><Money amount={exchange(reference.amount, reference.currency, currency, fx)} currency={currency} /></p></div><p className="text-[10px] text-muted text-right">{reference.source === 'tcgplayer' ? 'TCGPlayer' : 'Cardmarket'}<br />{reference.updatedAt && Number.isFinite(Date.parse(reference.updatedAt)) ? new Date(reference.updatedAt).toISOString().slice(0, 10) : 'Date unknown'}<br />{analysis.samples} observations</p></div>
    <div className="grid grid-cols-3 gap-2">{([7, 30, 90] as const).map((days) => <div key={days}><p className="text-[10px] text-muted">{days}D</p><p className="text-xs font-semibold mt-1">{fmtPct(analysis.changes[days]?.percent)}</p>{analysis.changes[days] && <p className="text-[9px] text-muted mt-0.5">since {analysis.changes[days]!.date}</p>}</div>)}</div>
    <PriceChart data={points} currency={currency} height={110} />
    {asking !== null && <label className="flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 accent-[var(--accent)]" /><span>I checked the exact printing, variant and comparable raw condition. This is an ungraded card.</span></label>}
    {result ? <div aria-live="polite" className="border-t border-line pt-3 space-y-2"><p className={`font-bold text-base ${color}`}>{titles[result.verdict]}</p><ul className="text-xs text-muted space-y-1 leading-relaxed">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      {result.percent !== null && <p className="text-xs">You pay {result.percent.toFixed(1)}% of the latest reference{card.quantity > 1 ? ` per card (${card.quantity} copies)` : ''}.</p>}
      {result.targetPrice !== null && <p className="text-xs">Your {target}% target: <Money amount={result.targetPrice} currency={currency} /> per card.</p>}
      {result.headroom !== null && result.headroom > 0 && <p className="text-[11px] text-muted"><Money amount={result.headroom} currency={currency} /> per card below reference, before tax, grading, shipping or selling fees. This is not expected profit.</p>}
    </div> : <div className="text-xs text-muted space-y-1"><p>The asking price above covers multiple entries. Check a single card entry to assess its price; the bundle calculator keeps working.</p>{analysis.flags.map((flag) => <p key={flag.code}>{flag.message}</p>)}</div>}
    <p className="text-[10px] text-muted leading-relaxed">The calculator uses your saved or adjusted values; this check uses the latest stored catalog reference. Sparse snapshots do not measure sales volume. An attractive price does not predict future returns.</p>
    <Link href="/investing" className="inline-block text-xs text-accent underline">Explore Pokémon movers and risk flags ↗</Link>
  </div>;
}
