'use client';

import { useEffect, useState } from 'react';
import { CURRENCIES, type Currency } from '@/lib/types';
import type { Rates } from '@/lib/fx';
import { evaluateCash, evaluateTrade, totalCards } from '@/lib/card-show';
import { Field, inputCls, Money } from '@/components/ui';
import { AmountField, CardBasket } from './CardBasket';
import { changeCurrency, createDraft, readDraft, type Basket, type Draft, type Side } from './draft';

const modes = [{ id: 'buy', label: 'Buying' }, { id: 'sell', label: 'Selling' }, { id: 'trade', label: 'Trading' }] as const;

export function CardShow({ storageKey, initialCurrency, fx, guest = false }: { storageKey: string; initialCurrency: Currency; fx: Rates; guest?: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => createDraft(initialCurrency));
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const [undo, setUndo] = useState<Draft | null>(null);

  useEffect(() => {
    // Restore only after mount so SSR and the first client render agree.
    /* eslint-disable react-hooks/set-state-in-effect -- one-time account-scoped draft hydration */
    try {
      const raw = localStorage.getItem(storageKey);
      const restored = readDraft(raw);
      if (restored) setDraft(restored);
      else if (raw) setNotice('The saved deal could not be restored. Start a new deal below.');
    } catch { setNotice('Device storage is unavailable. Keep this tab open to retain your deal.'); }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      // Persistence feedback reflects the outcome of writing to browser storage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [draft, ready, storageKey]);

  const update = (side: Side, basket: Basket) => setDraft((current) => ({ ...current, [side]: basket }));
  const { currency, mode } = draft;
  const basket = mode === 'sell' ? draft.sell : draft.buy;
  const market = totalCards(basket.cards, currency, fx);
  const cash = mode === 'trade' ? null : evaluateCash(market, basket.cash, draft.target, mode);
  const trade = evaluateTrade(
    draft.giving.cards.length ? totalCards(draft.giving.cards, currency, fx) : 0,
    draft.getting.cards.length ? totalCards(draft.getting.cards, currency, fx) : 0,
    draft.giving.cash, draft.getting.cash, draft.giving.rate, draft.getting.rate,
  );

  if (!ready) return <div className="py-8" role="status">Loading your card show deal…</div>;

  return <div className="py-6 space-y-5">
    <header className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-accent mb-1">At the table</p><h1 className="text-3xl font-bold tracking-tight">Card Show</h1><p className="text-xs text-muted mt-2">Check the numbers before you shake on it.</p></div>
      <div className="text-right shrink-0"><button type="button" className="text-xs border border-line rounded-lg px-3 py-2 hover:border-accent" onClick={() => {
        setUndo(draft); setDraft({ ...createDraft(currency), mode, target: draft.target }); setNotice('New deal started.');
      }}>New deal</button><p role="status" className="text-[10px] text-muted mt-2">{saved ? 'Saved on this device' : 'Draft is not saved'}</p></div>
    </header>
    {guest && <p className="rounded-xl border border-line p-3 text-xs text-muted">Guest calculator · your deal is saved on this device.</p>}
    {notice && <p role="status" className="rounded-xl border border-line p-3 text-xs text-muted">{notice} {undo && <button type="button" className="text-accent underline ml-2" onClick={() => { setDraft(undo); setUndo(null); setNotice('Previous deal restored.'); }}>Undo reset</button>}</p>}

    <div className="flex items-center gap-3">
      <div role="group" aria-label="Deal type" className="grid grid-cols-3 flex-1 rounded-xl bg-elev border border-line p-1">
        {modes.map((item) => <button type="button" key={item.id} aria-pressed={mode === item.id} onClick={() => setDraft((current) => ({ ...current, mode: item.id }))} className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${mode === item.id ? 'bg-accent text-bg' : 'text-muted hover:text-fg'}`}>{item.label}</button>)}
      </div>
      <Field label="Deal currency"><select className={`${inputCls} max-w-24`} value={currency} onChange={(e) => {
        const next = changeCurrency(draft, e.target.value as Currency, fx);
        if (next) { setDraft(next); setNotice(''); }
        else setNotice('Fix invalid cash amounts before switching currency. An exchange rate is required.');
      }}>{CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></Field>
    </div>

    {mode !== 'trade' ? <>
      <div className="card-surface rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <AmountField label={mode === 'buy' ? `Seller asking (${currency})` : `Buyer offering (${currency})`} value={basket.cash} onChange={(value) => update(mode, { ...basket, cash: value })} />
          <AmountField label={mode === 'buy' ? 'Your buy target (%)' : 'Your sell target (%)'} value={draft.target} min={1} max={100} placeholder="80" onChange={(target) => setDraft((current) => ({ ...current, target }))} />
        </div>
        <div className="flex items-center gap-2"><span className="text-xs text-muted mr-auto">Quick targets</span>{[70, 80, 90].map((pct) => <button type="button" key={pct} aria-pressed={draft.target === String(pct)} onClick={() => setDraft((current) => ({ ...current, target: String(pct) }))} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${draft.target === String(pct) ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted'}`}>{pct}%</button>)}</div>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {cash ? <section className={`rounded-2xl border p-5 space-y-3 ${cash.tone === 'good' ? 'border-up/30 bg-up/10' : cash.tone === 'bad' ? 'border-down/30 bg-down/10' : 'border-amber-400/30 bg-amber-400/5'}`}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs text-muted">{mode === 'buy' ? 'You would pay' : 'You would receive'}</p><p className="text-4xl font-bold tabular tracking-tight mt-1">{cash.percent.toFixed(1)}<span className="text-xl">%</span></p><p className="text-xs text-muted mt-1">of card market value</p></div>
            <span className={`text-xs font-semibold text-right max-w-40 ${cash.tone === 'good' ? 'text-up' : cash.tone === 'bad' ? 'text-down' : 'text-amber-400'}`}>{cash.advantage >= 0 ? mode === 'buy' ? 'At or below your buy target' : 'At or above your sell target' : mode === 'buy' ? 'Above your buy target' : 'Below your sell target'}</span>
          </div>
          <p className="text-sm">{cash.advantage === 0 ? 'Exactly at your target.' : <><Money amount={Math.abs(cash.advantage)} currency={currency} /> {cash.advantage >= 0 ? 'in your favor versus your target.' : mode === 'buy' ? 'above your target. Try offering' : 'below your target. Try asking for'} {cash.advantage < 0 && <Money amount={cash.target} currency={currency} />}{cash.advantage < 0 && '.'}</>}</p>
        </section> : <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Add cards with market values, enter the {mode === 'buy' ? 'asking price' : 'cash offer'}, and set a target to compare the deal.</div>}
      </div>
      {market !== null && <section aria-label="Cash value benchmarks" className="grid grid-cols-3 gap-2">
        {[70, 80, 90].map((percent) => <div key={percent} className="card-surface rounded-xl px-2 py-3 text-center"><p className="text-xs text-muted mb-1">{percent}% cash</p><p className="font-semibold text-sm"><Money amount={market * percent / 100} currency={currency} /></p></div>)}
      </section>}
      <CardBasket key={mode} title={mode === 'buy' ? 'Cards you’re buying' : 'Cards you’re selling'} basket={basket} onChange={(next) => update(mode, next)} currency={currency} fx={fx} />
      <p className="text-xs text-muted leading-relaxed">70–90% is your cash negotiation range. Lower helps when buying; higher helps when selling. Your target starts at 80% and can be changed.</p>
    </> : <>
      <p className="text-xs text-muted leading-relaxed">Start at 100% market value on both sides. If a vendor uses different percentages, adjust each side below. Cash always counts at full value.</p>
      <div aria-live="polite" aria-atomic="true" className="space-y-3">
        {trade ? <>
          <TradeResult title="Market-value result" result={trade.market} currency={currency} />
          {(draft.giving.rate !== '100' || draft.getting.rate !== '100') && <TradeResult title="At negotiated percentages" result={trade.negotiated} currency={currency} />}
        </> : <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Add cards or cash on both sides. Fill in every card’s market value and valid percentages to compare.</div>}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <CardBasket title="You give" basket={draft.giving} onChange={(next) => update('giving', next)} currency={currency} fx={fx} trade />
        <CardBasket title="You get" basket={draft.getting} onChange={(next) => update('getting', next)} currency={currency} fx={fx} trade />
      </div>
      <p className="text-xs text-muted">Within 5% of the larger side is labeled roughly even. The exact difference and balancing cash are still shown.</p>
    </>}
    <footer className="border-t border-line pt-4 text-[11px] leading-relaxed text-muted space-y-2">
      <p>Use values for the exact printing, language, condition and grade. Catalog references may be for raw cards. Enter a matching sold-comp value for graded cards or condition adjustments.</p>
      <p>All totals are in {currency}. {fx.date === 'fallback' ? 'Using estimated fallback exchange rates; verify conversion before agreeing.' : `Exchange rates dated ${fx.date}.`} Saved card prices are snapshots; re-add a card to fetch its latest available catalog reference.</p>
    </footer>
  </div>;
}

function TradeResult({ title, result, currency }: { title: string; result: NonNullable<ReturnType<typeof evaluateTrade>>['market']; currency: Currency }) {
  return <section className={`rounded-2xl border p-5 ${result.verdict === 'behind' ? 'bg-down/10 border-down/30' : result.verdict === 'ahead' ? 'bg-up/10 border-up/30' : 'bg-accent/10 border-accent/30'}`}>
    <p className="text-xs text-muted mb-2">{title}</p>
    <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-lg">{result.verdict === 'balanced' ? 'Roughly even' : result.verdict === 'ahead' ? 'You’re ahead' : 'You’re behind'}</h2><p className={`font-bold tabular text-xl ${result.difference < 0 ? 'text-down' : result.difference > 0 ? 'text-up' : ''}`}>{result.difference > 0 ? '+' : result.difference < 0 ? '−' : ''}<Money amount={Math.abs(result.difference)} currency={currency} /></p></div>
    <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-muted"><p>You give <span className="block text-fg font-semibold text-sm mt-1"><Money amount={result.giving} currency={currency} /></span></p><p>You get <span className="block text-fg font-semibold text-sm mt-1"><Money amount={result.getting} currency={currency} /></span></p></div>
    <p className="mt-3 text-xs">{result.difference === 0 ? 'Both sides match exactly.' : <>For an exact match, {result.difference < 0 ? 'they add' : 'you add'} <Money amount={Math.abs(result.difference)} currency={currency} /> cash.</>}</p>
  </section>;
}
