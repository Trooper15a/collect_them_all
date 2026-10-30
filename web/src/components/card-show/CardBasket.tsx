'use client';

import { CardImage, Field, inputCls, Money } from '@/components/ui';
import { CURRENCIES, type CardSummary, type Currency } from '@/lib/types';
import { exchange, parseAmount, totalCards } from '@/lib/card-show';
import type { Rates } from '@/lib/fx';
import { CardSearch } from './CardSearch';
import { catalogCard, type Basket, type ShowCard } from './draft';
import { PhotoCardPicker } from './PhotoCardPicker';

export function AmountField({ label, value, onChange, placeholder = '0.00', optional = false, max = 1_000_000_000, min = 0 }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; optional?: boolean; max?: number; min?: number;
}) {
  const parsed = parseAmount(value);
  const invalid = value !== '' && (parsed === null || parsed < min || parsed > max);
  return <Field label={label}>
    <input type="text" inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder} maxLength={40}
      aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} className={`${inputCls} tabular ${invalid ? 'border-down' : ''}`} />
    {invalid && <span className="block text-xs text-down mt-1">Enter {min}–{max.toLocaleString()} with up to two decimals.</span>}
    {!invalid && optional && <span className="block text-[11px] text-muted mt-1">Optional · leave blank for zero.</span>}
  </Field>;
}

export function CardBasket({ title, basket, onChange, currency, fx, trade = false }: {
  title: string; basket: Basket; onChange: (basket: Basket) => void; currency: Currency; fx: Rates; trade?: boolean;
}) {
  const update = (key: string, patch: Partial<ShowCard>) => onChange({ ...basket, cards: basket.cards.map((card) => card.key === key ? { ...card, ...patch } : card) });
  const add = (card?: CardSummary) => {
    if (basket.cards.length >= 100) return;
    const entry: ShowCard = card ? catalogCard(card) : {
      key: crypto.randomUUID(), id: null, name: '', detail: 'Manual entry', value: '', currency, quantity: 1, options: [], optionIndex: 0, custom: true, notes: '',
    };
    onChange({ ...basket, cards: [...basket.cards, entry] });
  };
  const total = totalCards(basket.cards, currency, fx);

  return <section className="card-surface rounded-2xl p-4 space-y-4 min-w-0" aria-label={title}>
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <span className="text-xs text-muted">{basket.cards.reduce((sum, card) => sum + card.quantity, 0)} cards</span>
    </div>
    {basket.cards.length < 100 ? <>
      <PhotoCardPicker onAdd={add} />
      <CardSearch label={`Search cards for ${title.toLowerCase()}`} onAdd={add} currency={currency} fx={fx} />
      <button type="button" onClick={() => add()} className="text-xs text-accent font-semibold py-1">+ Add manual / graded card</button>
    </> : <p className="text-xs text-muted">100 entries reached. Start another deal for more cards.</p>}

    {!basket.cards.length && <div className="border border-dashed border-line rounded-xl px-4 py-6 text-center">
      <p className="text-sm font-medium">{trade ? 'Cards on this side' : 'Start with a card'}</p>
      <p className="text-xs text-muted mt-1">Take a picture to identify the card and fill in its market value.</p>
    </div>}

    <div className="space-y-3">
      {basket.cards.map((card) => {
        const unit = parseAmount(card.value);
        const converted = unit !== null && unit > 0 ? exchange(unit * card.quantity, card.currency, currency, fx) : null;
        const option = card.options[card.optionIndex];
        const date = option?.updatedAt && !Number.isNaN(Date.parse(option.updatedAt)) ? new Date(option.updatedAt).toLocaleDateString('en-CA', { timeZone: 'UTC' }) : null;
        return <article key={card.key} className="rounded-xl border border-line p-3 space-y-3">
          <div className="flex items-start gap-3">
            {card.id && <CardImage id={card.id} className="w-10 rounded shrink-0" alt={card.name} />}
            <div className="flex-1 min-w-0">
              {card.id ? <p className="font-semibold text-sm leading-snug">{card.name}</p> : <Field label="Card name / grade"><input className={inputCls} value={card.name} maxLength={240} placeholder="e.g. Charizard · PSA 10" onChange={(e) => update(card.key, { name: e.target.value })} /></Field>}
              <p className="text-[11px] text-muted mt-1">{card.detail}</p>
            </div>
            <button type="button" aria-label={`Remove ${card.name || 'manual card'}`} onClick={() => onChange({ ...basket, cards: basket.cards.filter((c) => c.key !== card.key) })} className="text-muted hover:text-down w-8 h-8 shrink-0 text-xl">×</button>
          </div>
          {card.options.length > 0 && <Field label="Price reference / variant">
            <select className={`${inputCls} text-xs`} value={card.custom ? '-1' : card.optionIndex} onChange={(e) => {
              const index = Number(e.target.value), selected = card.options[index];
              if (selected) update(card.key, { optionIndex: index, value: selected.value, currency: selected.currency, custom: false });
              else update(card.key, { custom: true });
            }}>
              <option value="-1">Manual / adjusted value</option>
              {card.options.map((item, index) => <option key={index} value={index}>{item.label}</option>)}
            </select>
            <span className="block text-[11px] text-muted mt-1">{card.custom ? 'Manual value; verify against matching condition or grade.' : `Updated: ${date ?? 'date unavailable'}. Check the exact printing and condition.`}</span>
          </Field>}
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <AmountField label={`Unit market value (${card.currency})`} value={card.value} onChange={(value) => update(card.key, { value, custom: true })} />
            <Field label="Currency"><select className={inputCls} value={card.currency} onChange={(e) => update(card.key, { currency: e.target.value as Currency, custom: true })}>{CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></Field>
          </div>
          <Field label="Condition / grade / comp note (optional)"><input className={`${inputCls} text-xs`} value={card.notes} maxLength={240} placeholder="e.g. LP · recent sold comp" onChange={(e) => update(card.key, { notes: e.target.value })} /></Field>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" aria-label={`Decrease ${card.name || 'card'} quantity`} disabled={card.quantity <= 1} onClick={() => update(card.key, { quantity: card.quantity - 1 })} className="w-9 h-9 rounded-lg bg-accent/10 disabled:opacity-30">−</button>
              <span aria-label="Quantity" className="text-sm tabular w-6 text-center">{card.quantity}</span>
              <button type="button" aria-label={`Increase ${card.name || 'card'} quantity`} disabled={card.quantity >= 999} onClick={() => update(card.key, { quantity: card.quantity + 1 })} className="w-9 h-9 rounded-lg bg-accent/10 disabled:opacity-30">+</button>
            </div>
            <span className="text-sm font-semibold">{converted === null ? <span className="text-down text-xs">Market value needed</span> : <Money amount={converted} currency={currency} />}</span>
          </div>
        </article>;
      })}
    </div>

    <div className="border-t border-line pt-3 flex justify-between gap-2 text-sm">
      <span className="text-muted">Card market total</span>
      <span className="font-semibold">{total === null ? basket.cards.length ? 'Incomplete' : '—' : <Money amount={total} currency={currency} />}</span>
    </div>
    {basket.cards.length > 0 && total === null && <p role="status" className="text-xs text-down">Set a positive market value for every card. Currency conversion must also be available before comparing.</p>}
    {trade && <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
      <AmountField label={`Cash added (${currency})`} value={basket.cash} optional onChange={(cash) => onChange({ ...basket, cash })} />
      <AmountField label="Cards valued at (%)" value={basket.rate} min={1} max={200} placeholder="100" onChange={(rate) => onChange({ ...basket, rate })} />
    </div>}
  </section>;
}
