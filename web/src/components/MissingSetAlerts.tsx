"use client";

import { useState } from "react";
import { bestPrice, type CardPrices, variantLabel } from "@/lib/types";
import { Button, Field, inputCls } from "./ui";

export interface MissingSingle { id: string; prices: CardPrices }

/** Bulk actions keep existing watches and their baselines. */
export async function watchMissingSingles(cards: MissingSingle[], variant: string, direction: string, thresholdPct: number) {
  const response = await fetch("/api/alerts");
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Could not load existing alerts");
  const existing = new Set((body.alerts ?? []).map((alert: { card: { id: string } }) => alert.card.id));
  const result = { saved: 0, existing: 0, unpriced: 0, failed: 0 };
  for (const card of cards) {
    if (existing.has(card.id)) { result.existing++; continue; }
    if (!bestPrice(card.prices, variant)) { result.unpriced++; continue; }
    try {
      const saved = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id, variantType: variant, direction, thresholdPct }) });
      if (!saved.ok) throw new Error("Could not save alert");
      result.saved++;
    } catch { result.failed++; }
  }
  return result;
}

export function MissingSetAlerts({ cards }: { cards: MissingSingle[] }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState("normal");
  const [direction, setDirection] = useState("drop");
  const [threshold, setThreshold] = useState("10");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const variants = [...new Set(["normal", ...cards.flatMap((card) => [...Object.keys(card.prices.tcgplayer?.variants ?? {}), ...Object.keys(card.prices.cardmarket?.variants ?? {})])])];
  const valid = Number.isFinite(Number(threshold)) && Number(threshold) >= 0.5 && Number(threshold) <= 1000;
  const priced = cards.filter((card) => bestPrice(card.prices, variant)).length;
  async function save() {
    if (busy || !valid || !priced) return;
    setBusy(true); setMessage("");
    try {
      const result = await watchMissingSingles(cards, variant, direction, Number(threshold));
      setMessage(`${result.saved} alerts saved · ${result.existing} already watched · ${result.unpriced} without this finish's price · ${result.failed} failed.${result.failed ? " Try again to retry failures." : ""}`);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="mt-3">
    <Button variant="ghost" className="text-xs" onClick={() => setOpen((value) => !value)} aria-expanded={open}>Watch missing singles ({cards.length})</Button>
    {open && <div className="card-surface rounded-2xl p-4 mt-2 space-y-3">
      <p className="text-xs text-muted">In-app alerts start from each single&apos;s current market price. Existing alerts keep their settings and starting price. Choose each card&apos;s Alert button to edit it.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Finish"><select className={inputCls} value={variant} disabled={busy} onChange={(e) => setVariant(e.target.value)}>{variants.map((v) => <option key={v} value={v}>{variantLabel(v)}</option>)}</select></Field>
        <Field label="Price movement"><select className={inputCls} value={direction} disabled={busy} onChange={(e) => setDirection(e.target.value)}><option value="drop">Drops</option><option value="rise">Rises</option><option value="either">Either direction</option></select></Field>
        <Field label="Percentage"><input className={inputCls} type="number" min="0.5" max="1000" step="0.5" value={threshold} disabled={busy} onChange={(e) => setThreshold(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted">{priced} of {cards.length} missing singles have a price for {variantLabel(variant)}.</p>
      {!valid && <p className="text-xs text-down">Enter a percentage between 0.5 and 1000.</p>}
      <Button disabled={busy || !valid || !priced} onClick={save}>{busy ? "Saving…" : "Enable missing-card alerts"}</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>}
  </div>;
}
