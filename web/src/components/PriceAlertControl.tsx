"use client";

import { useEffect, useId, useRef, useState } from "react";
import { alertQuote, type AlertDirection } from "@/lib/alert-rules";
import { fmtMoney } from "@/lib/format";
import { useHidePrices } from "@/lib/ui-prefs";
import { variantLabel, type CardPrices } from "@/lib/types";
import { Button, Field, inputCls } from "./ui";

export interface PriceAlertSettings {
  id: number;
  variantType: string;
  thresholdPct: number;
  direction?: AlertDirection;
  basePrice: number | null;
  baseCurrency: string | null;
}

interface Props {
  cardId: string;
  cardName: string;
  defaultVariant?: string;
  prices?: CardPrices;
  initialAlert?: PriceAlertSettings | null;
  onChanged?: () => void;
}

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Could not update price alert. Please try again.");
  return body;
}

export function PriceAlertControl(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="ghost" className="px-2.5 py-1.5 text-xs" aria-label={`Price alert for ${props.cardName}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {props.initialAlert ? "Edit alert" : "Price alert"}
    </Button>
    {open && <AlertDialog {...props} onClose={() => setOpen(false)} />}
  </>;
}

function AlertDialog({ cardId, cardName, defaultVariant, prices: suppliedPrices, initialAlert, onChanged, onClose }: Props & { onClose: () => void }) {
  const hidePrices = useHidePrices();
  const money = (amount: number, currency: string) => hidePrices ? "•••" : fmtMoney(amount, currency);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [prices, setPrices] = useState<CardPrices>(suppliedPrices ?? {});
  const [alert, setAlert] = useState<PriceAlertSettings | null>(initialAlert ?? null);
  const [variant, setVariant] = useState(initialAlert?.variantType ?? defaultVariant ?? "normal");
  const [direction, setDirection] = useState<AlertDirection>(initialAlert?.direction ?? "either");
  const [threshold, setThreshold] = useState(String(initialAlert?.thresholdPct ?? 10));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([request(`/api/cards/${encodeURIComponent(cardId)}`), request("/api/alerts")])
      .then(([cardBody, alertBody]) => {
        if (cancelled) return;
        const nextPrices: CardPrices = cardBody.card?.prices ?? {};
        const saved: PriceAlertSettings | null = (alertBody.alerts ?? []).find((a: { card: { id: string } }) => a.card.id === cardId) ?? null;
        const variants = [...Object.keys(nextPrices.tcgplayer?.variants ?? {}), ...Object.keys(nextPrices.cardmarket?.variants ?? {})];
        setPrices(nextPrices);
        setAlert(saved);
        setVariant(saved?.variantType ?? defaultVariant ?? (variants.includes("normal") ? "normal" : variants[0]) ?? "normal");
        setDirection(saved?.direction ?? "either");
        setThreshold(String(saved?.thresholdPct ?? 10));
        setLoading(false);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load price alert"); });
    return () => { cancelled = true; };
  }, [cardId, defaultVariant]);

  const variants = [...new Set([variant, ...(alert ? [alert.variantType] : []), ...Object.keys(prices.tcgplayer?.variants ?? {}), ...Object.keys(prices.cardmarket?.variants ?? {})])];
  const quote = alertQuote(prices, variant);
  const validThreshold = Number.isFinite(Number(threshold)) && Number(threshold) >= 0.5 && Number(threshold) <= 1000;
  const sameFinish = alert?.variantType === variant;

  async function save() {
    if (!quote || !validThreshold) return;
    setBusy(true); setError(null);
    try {
      await request("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId, variantType: variant, direction, thresholdPct: Number(threshold) }) });
      onChanged?.(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save alert"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!alert) return;
    setBusy(true); setError(null);
    try {
      await request(`/api/alerts/${alert.id}`, { method: "DELETE" });
      onChanged?.(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove alert"); }
    finally { setBusy(false); }
  }

  async function reset() {
    if (!alert || !sameFinish || !quote) return;
    setBusy(true); setError(null);
    try {
      const saved = await request(`/api/alerts/${alert.id}`, { method: "POST" });
      setAlert(saved); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reset baseline"); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={onClose} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-bg p-5 text-fg shadow-2xl backdrop:bg-black/60">
    <div className="flex items-start justify-between gap-3">
      <div><h2 id={titleId} className="font-semibold">Price alert</h2><p className="text-sm text-muted">{cardName}</p></div>
      <Button type="button" variant="ghost" aria-label="Close price alert" onClick={onClose}>×</Button>
    </div>
    <p className="mt-3 text-xs text-muted">In-app alerts compare the selected finish with its saved market price. Checks follow imported daily prices. No email or push notification is sent.</p>
    {loading && !error && <p role="status" className="mt-4 text-sm text-muted">Loading alert and prices…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-down">{error}</p>}
    {!loading && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className="space-y-3">
        <Field label="Finish"><select className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value)}>{variants.map(v => <option key={v} value={v}>{variantLabel(v)}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction"><select className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as AlertDirection)}><option value="drop">Drop</option><option value="rise">Rise</option><option value="either">Either</option></select></Field>
          <Field label="Percentage"><input className={inputCls} type="number" min={0.5} max={1000} step="any" required value={threshold} onChange={(e) => setThreshold(e.target.value)} /></Field>
        </div>
        <div className="rounded-xl bg-elev p-3 text-xs space-y-1">
          <p>Current {variantLabel(variant)} market quote: {quote ? `${money(quote.amount, quote.currency)} ${quote.currency}` : "Unavailable"}</p>
          <p>Baseline: {sameFinish && alert.basePrice != null && alert.baseCurrency ? `${money(alert.basePrice, alert.baseCurrency)} ${alert.baseCurrency}` : quote ? `${money(quote.amount, quote.currency)} ${quote.currency} when saved` : "Unavailable"}</p>
          {sameFinish && <p className="text-muted">Editing direction or percentage preserves your baseline.</p>}
          {alert && !sameFinish && <p className="text-muted">Saving a different finish starts a new baseline from its current quote.</p>}
        </div>
        {!quote && <p className="text-xs text-muted">No usable quote for this finish. Saving and resetting are unavailable until a price is imported. You can still remove an existing alert.</p>}
        <Button type="submit" className="w-full" disabled={busy || !quote || !validThreshold}>{busy ? "Updating…" : alert ? "Save alert" : "Enable alert"}</Button>
        {alert && <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={busy || !quote || !sameFinish} onClick={reset}>Reset baseline</Button>
          <Button type="button" variant="danger" disabled={busy} onClick={remove}>Remove alert</Button>
        </div>}
        {alert && <p className="text-xs text-muted">Reset baseline acknowledges this alert and starts again from the saved finish’s current quote. Save a finish change before resetting.</p>}
      </fieldset>
    </form>}
  </dialog>;
}
