"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AddToPortfolioSheet } from "@/components/AddToPortfolioSheet";
import { PriceAlertControl } from "@/components/PriceAlertControl";
import { BackLink } from "@/components/BackLink";
import { PriceChart } from "@/components/PriceChart";
import { PriceContext } from "@/components/PriceContext";
import { showToast } from "@/components/Toast";
import { Button, CardImage, Empty, Money, Section, Segmented, Skeleton, TcgBadge } from "@/components/ui";
import { RANGES, type Range, fmtMoney, rangeToDays } from "@/lib/format";
import { GRADE_MULT } from "@/lib/grades";
import { useHidePrices } from "@/lib/ui-prefs";
import { convert, type Rates } from "@/lib/fx";
import { marketplaceLinks } from "@/lib/marketplace";
import { bestPrice, CONDITION_LABELS, type NormalizedCard, variantLabel } from "@/lib/types";
import { defaultVariant, unitValue, type OwnedCopy } from "@/lib/valuation";
import type { EbaySoldItem } from "@/lib/ebay";

interface PopGrade { grade: string; count: number }
interface PopGrader { name: string; total: number; gems: number; gemRate: number }
interface PopData {
  found: boolean;
  totalPop: number;
  totalGems: number;
  gemRate: number;
  grades: PopGrade[];
  graders: PopGrader[];
  gemrateUrl: string;
  lastUpdated: string | null;
}

interface HistoryPoint {
  date: string;
  tcgplayerMarket: number | null;
  cardmarketAvg: number | null;
}

export default function CardPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><CardDetails /></Suspense>;
}

function CardDetails() {
  const hidePrices = useHidePrices();
  const fm = (n: number | null | undefined, c?: string | null) => (hidePrices ? "•••" : fmtMoney(n, c ?? undefined));
  // Next 16 useParams() returns the RAW percent-encoded segment — card ids contain ":",
  // so decode once and use the decoded `id` for all comparisons/DB-bound calls.
  // (fetches re-encode with encodeURIComponent where needed.)
  const { id: rawId } = useParams<{ id: string }>();
  const id = decodeURIComponent(rawId);
  const searchParams = useSearchParams();
  const itemId = searchParams.get("itemId");
  const initialVariant = searchParams.get("variant");
  const contextKey = JSON.stringify([id, itemId, initialVariant]);
  const requestNumber = useRef(0);
  const [loadedContext, setLoadedContext] = useState<string | null>(null);
  const [item, setItem] = useState<OwnedCopy | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [card, setCard] = useState<NormalizedCard | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState<{ message: string; context: string } | null>(null);
  const [range, setRange] = useState<Range>("3M");
  const [market, setMarket] = useState<"tcgplayer" | "cardmarket">("tcgplayer");
  const [mode, setMode] = useState<"raw" | "graded">("raw");
  const [zoom, setZoom] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now] = useState(() => Date.now());
  const [fx, setFx] = useState<{ rates: Rates; currency: string } | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [wishBusy, setWishBusy] = useState(false);
  const [ebaySold, setEbaySold] = useState<{ raw: EbaySoldItem[]; graded: { grade: string; items: EbaySoldItem[] }[] } | null>(null);
  const [ebayLoadedId, setEbayLoadedId] = useState<string | null>(null);
  const [pop, setPop] = useState<PopData | null>(null);
  const [popLoadedId, setPopLoadedId] = useState<string | null>(null);
  const ebayLoading = !!card && ebayLoadedId !== card.id;
  const popLoading = !!card && popLoadedId !== card.id;
  const lastTap = useRef(0);

  const load = async (refresh = false, variant: string | null = selectedVariant): Promise<boolean> => {
    const request = ++requestNumber.current;
    const key = contextKey;
    const query = new URLSearchParams();
    if (itemId !== null) query.set("itemId", itemId);
    else if (variant) query.set("variant", variant);
    if (refresh) query.set("refresh", "1");
    try {
      const r = await fetch(`/api/cards/${encodeURIComponent(id)}${query.size ? `?${query}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      if (request !== requestNumber.current) return false;
      setCard(d.card);
      setItem(d.item ?? null);
      setSelectedVariant(d.variant ?? d.item?.variantType ?? defaultVariant(d.card.prices));
      setHistory(d.history ?? []);
      setError(null);
      setLoadedContext(key);
      if (d.fx && d.displayCurrency) setFx({ rates: d.fx, currency: d.displayCurrency });
      if (!d.card.prices.tcgplayer && d.card.prices.cardmarket) setMarket("cardmarket");
      return true;
    } catch (e) {
      if (request === requestNumber.current && !refresh) setError({ message: (e as Error).message, context: key });
      return false;
    }
  };

  const loadWishlist = () =>
    fetch("/api/wishlist")
      .then((r) => r.json())
      .then((d) => {
        const found = (d.items ?? []).some((i: { card: { id: string } }) => i.card.id === id);
        setWishlisted(found);
      })
      .catch(() => undefined);
  const toggleWishlist = async () => {
    if (wishBusy) return; // guard double-tap
    setWishBusy(true);
    const addingNow = !wishlisted;
    setWishlisted((prev) => !prev); // optimistic
    try {
      const r = await fetch("/api/wishlist", {
        method: addingNow ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: id }),
      });
      if (!r.ok) throw new Error("Failed");
      showToast(addingNow ? "Added to wishlist ✓" : "Removed from wishlist", addingNow ? "up" : "info");
    } catch {
      setWishlisted((prev) => !prev); // revert
      showToast("Save failed — try again", "down");
    } finally {
      setWishBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    const requests = requestNumber;
    void Promise.resolve().then(() => { if (active) return load(false, initialVariant); });
    loadWishlist();
    return () => { active = false; requests.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, itemId, initialVariant]);

  useEffect(() => {
    if (!card) return;
    let active = true;
    const p = new URLSearchParams({ name: card.name, tcg: card.tcg });
    if (card.setName) p.set("set", card.setName);
    if (card.cardNumber) p.set("num", card.cardNumber);
    fetch(`/api/ebay/sold?${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setEbaySold(d ? { raw: d.raw, graded: d.graded } : null); })
      .catch(() => { if (active) setEbaySold(null); })
      .finally(() => { if (active) setEbayLoadedId(card.id); });
    fetch(`/api/pop?cardId=${encodeURIComponent(card.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setPop(d?.found ? d : null); })
      .catch(() => { if (active) setPop(null); })
      .finally(() => { if (active) setPopLoadedId(card.id); });
    return () => { active = false; };
  }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => {
    const days = rangeToDays(range);
    const cutoff = days ? new Date(now - days * 86400000).toISOString().slice(0, 10) : "";
    const native = market === "tcgplayer" ? "USD" : "EUR";
    return history.filter((h) => h.date >= cutoff).map((h) => {
      const v = market === "tcgplayer" ? h.tcgplayerMarket : h.cardmarketAvg;
      return { date: h.date, value: v != null && fx ? convert(v, native, fx.currency, fx.rates) : v };
    });
  }, [history, range, market, now, fx]);

  if (error?.context === contextKey) return <Empty>{error.message}</Empty>;
  if (!card || loadedContext !== contextKey)
    return (
      <div className="pt-4 space-y-3">
        <Skeleton className="aspect-[63/88] w-2/3 mx-auto" />
        <Skeleton className="h-24" />
      </div>
    );

  const tp = card.prices.tcgplayer;
  const cm = card.prices.cardmarket;
  const active = market === "tcgplayer" ? tp : cm;
  const currency = active?.currency ?? "USD";
  const variant = selectedVariant ?? defaultVariant(card.prices);
  const headline = bestPrice({ [market]: active }, variant);
  const ownedValue = item ? unitValue(card, item.variantType, item.condition, item.isGraded, item.gradingCompany, item.grade) : null;
  const variants = [...new Set([variant, ...Object.keys(tp?.variants ?? {}), ...Object.keys(cm?.variants ?? {})])];
  const meta = (card.meta ?? {}) as Record<string, unknown>;
  const isSealed = card.rarity === "Sealed" || meta.sealed === true;
  const displayCurrency = fx?.currency ?? currency;
  const toDisplay = (amount: number) => (fx ? convert(amount, currency, fx.currency, fx.rates) : amount);
  const listingPrice = (item: EbaySoldItem) => <Money
    amount={fx ? convert(item.price, item.currency, fx.currency, fx.rates) : item.price}
    currency={fx?.currency ?? item.currency}
  />;

  return (
    <div>
      <header className="pt-2 pb-3 flex items-center gap-3">
        <BackLink fallback="/scan" label="Back" />
        <div className="flex-1" />
        <PriceAlertControl key={id} cardId={id} cardName={card.name} defaultVariant={selectedVariant ?? "normal"} />
        <button
          onClick={async () => {
            if (refreshing) return;
            setRefreshing(true);
            const ok = await load(true);
            setRefreshing(false);
            if (ok) showToast("Price updated", "up");
            else showToast("Refresh failed — try again", "down");
          }}
          className="text-xs text-muted"
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh price"}
        </button>
      </header>

      <button
        onClick={() => {
          const now = Date.now();
          if (now - lastTap.current < 350) { setZoom(true); }
          lastTap.current = now;
        }}
        className="block w-[68%] mx-auto rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        aria-label="Zoom card image"
      >
        {isSealed ? (
          // sealed product shots aren't card-shaped — keep natural aspect
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/images/${encodeURIComponent(card.id)}?size=high`} alt={card.name} className="w-full object-contain bg-elev" />
        ) : (
          <CardImage id={card.id} size="high" className="w-full" alt={card.name} />
        )}
      </button>
      <div className="text-center text-[10px] text-muted mt-1.5">Double-tap to zoom</div>

      <div className="mt-4">
        <TcgBadge tcg={card.tcg} lang={card.language} />
        <h1 className="text-2xl font-bold leading-tight mt-1">{card.name}</h1>
        <div className="text-sm text-muted">
          {card.setName} {card.setCode && `(${card.setCode.toUpperCase()})`} {card.cardNumber && `· #${card.cardNumber}`} {card.rarity && `· ${card.rarity}`}
        </div>
      </div>

      {item && (
        <section aria-label="Your copy" className="card-surface rounded-3xl p-4 mt-4 border border-accent/30">
          <div className="text-sm font-semibold">Your copy · <a className="text-accent" href={`/portfolios/${item.portfolioId}`}>{item.portfolioName}</a></div>
          <div className="text-sm text-muted mt-1">
            {variantLabel(item.variantType)} · {CONDITION_LABELS[item.condition as keyof typeof CONDITION_LABELS] ?? item.condition}
            {item.isGraded && ` · ${item.gradingCompany ?? "Graded"} ${item.grade ?? ""}`}
          </div>
          <div className="mt-2 text-3xl font-bold tabular">
            {ownedValue ? <Money amount={fx ? convert(ownedValue.amount, ownedValue.currency, fx.currency, fx.rates) : ownedValue.amount} currency={fx?.currency ?? ownedValue.currency} /> : <span className="text-lg text-muted">No quote for this finish</span>}
          </div>
          <div className="text-xs text-muted">Per-copy {item.isGraded ? "graded" : "condition-adjusted"} estimate</div>
          <div className="mt-2 text-sm">{item.quantity} {item.quantity === 1 ? "copy" : "copies"} · Total estimate {ownedValue ? <Money amount={(fx ? convert(ownedValue.amount, ownedValue.currency, fx.currency, fx.rates) : ownedValue.amount) * item.quantity} currency={fx?.currency ?? ownedValue.currency} /> : "unavailable"}</div>
          <div className="text-xs text-muted mt-2">Based on the exact finish&apos;s raw market quote; condition and grading values are estimates.</div>
        </section>
      )}

      <div className="card-surface rounded-3xl p-4 mt-4">
        <div className="text-sm font-semibold mb-2">{item ? "Raw market reference" : "Market value"} · {variantLabel(variant)}</div>
        {!item && <label className="flex items-center gap-2 text-xs text-muted mb-3">Finish
          <select aria-label="Finish" value={variant} className="rounded-lg bg-elev border border-line px-2 py-1" onChange={(e) => {
            const next = e.target.value;
            setSelectedVariant(next);
            setHistory([]);
            load(false, next);
          }}>
            {variants.map((v) => <option key={v} value={v}>{variantLabel(v)}</option>)}
          </select>
        </label>}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Segmented
            value={market}
            onChange={setMarket}
            size="xs"
            options={[
              { value: "tcgplayer", label: `TCGPlayer${tp ? "" : " (n/a)"}` },
              { value: "cardmarket", label: `CardMarket${cm ? "" : " (n/a)"}` },
            ]}
          />
          {!isSealed && (
            <Segmented
              value={mode}
              onChange={setMode}
              size="xs"
              options={[
                { value: "raw", label: "Raw" },
                { value: "graded", label: "Graded" },
              ]}
            />
          )}
        </div>
        <div className="mt-3 text-3xl font-bold tabular">{headline ? <Money amount={toDisplay(headline.amount)} currency={displayCurrency} /> : <span className="text-muted text-lg">No {market} pricing for this {isSealed ? "product" : "card"}</span>}</div>
        {headline && (
          <div className="text-xs text-muted">
            {variantLabel(headline.variant)} · raw market estimate
            {displayCurrency !== currency && (
              <>
                {" "}
                · <Money amount={headline.amount} currency={currency} /> on {market === "tcgplayer" ? "TCGPlayer" : "CardMarket"}
              </>
            )}
          </div>
        )}
        {headline && <div className="mt-1"><PriceContext prices={card.prices} market={market} variant={variantLabel(headline.variant)} amount={headline.amount} /></div>}
        <div className="text-xs text-muted mt-2">Raw market history · {variantLabel(variant)}</div>
        <div className="mt-2 -mx-2">
          <PriceChart data={series} currency={displayCurrency} height={160} />
        </div>
        <div className="mt-2 flex justify-center">
          <Segmented value={range} onChange={setRange} size="xs" options={RANGES.map((r) => ({ value: r, label: r }))} />
        </div>

        {mode === "raw" && active && (
          <table className="w-full text-sm mt-4">
            <caption className="text-xs text-muted text-left mb-2">Market reference quotes by finish · excludes condition and grading adjustments</caption>
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left font-medium py-1">Variant</th>
                {market === "tcgplayer" ? (
                  <>
                    <th className="text-right font-medium">Low</th>
                    <th className="text-right font-medium">Mid</th>
                    <th className="text-right font-medium">Market</th>
                    <th className="text-right font-medium">High</th>
                  </>
                ) : (
                  <>
                    <th className="text-right font-medium">Low</th>
                    <th className="text-right font-medium">Trend</th>
                    <th className="text-right font-medium">Avg</th>
                    <th className="text-right font-medium">7d / 30d</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="tabular">
              {Object.entries(active.variants ?? {}).map(([k, v]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-1.5">{variantLabel(k)}</td>
                  {market === "tcgplayer" ? (
                    <>
                      <td className="text-right text-muted">{fm(v.low, currency)}</td>
                      <td className="text-right text-muted">{fm(v.mid, currency)}</td>
                      <td className="text-right font-semibold">{fm(v.market, currency)}</td>
                      <td className="text-right text-muted">{fm(v.high, currency)}</td>
                    </>
                  ) : (
                    <>
                      <td className="text-right text-muted">{fm(v.low, currency)}</td>
                      <td className="text-right font-semibold">{fm(v.trend ?? v.market, currency)}</td>
                      <td className="text-right text-muted">{fm(v.market ?? v.avg1, currency)}</td>
                      <td className="text-right text-muted">
                        {fm(v.avg7, currency)} / {fm(v.avg30, currency)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {mode === "graded" && (
          <div className="mt-4">
            <div className="text-xs text-muted mb-2">Estimated graded values (multiplier of raw market).</div>
            <div className="grid grid-cols-2 gap-2 text-sm tabular">
              {Object.entries(GRADE_MULT).map(([g, m]) => (
                <div key={g} className="flex justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2">
                  <span className="text-muted">{g}</span>
                  <span className="font-semibold">{headline ? fm(toDisplay(headline.amount * m), displayCurrency) : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Section title="Buy">
        <div className="card-surface rounded-2xl p-4 space-y-2 text-sm">
          {marketplaceLinks(card, card.prices).map((link) => (
            <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2.5 hover:bg-white/[0.06]">
              <span>{link.label}</span>
              <span className="text-accent">↗</span>
            </a>
          ))}
        </div>
      </Section>

      {!isSealed && (
        <Section title="Population">
          <div className="card-surface rounded-2xl p-4 text-sm">
            {popLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-24" />
              </div>
            ) : pop ? (
              <>
                <div className="grid grid-cols-3 gap-3 text-center mb-4">
                  <div>
                    <div className="text-2xl font-bold tabular">{fmtPop(pop.totalPop)}</div>
                    <div className="text-[10px] text-muted uppercase tracking-wider">Total graded</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold tabular text-up">{fmtPop(pop.totalGems)}</div>
                    <div className="text-[10px] text-muted uppercase tracking-wider">Gem Mint+</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold tabular">{pop.gemRate}%</div>
                    <div className="text-[10px] text-muted uppercase tracking-wider">Gem rate</div>
                  </div>
                </div>
                <div className="space-y-1">
                  {pop.grades.filter((g) => g.count > 0).map((g) => {
                    const pct = pop.totalPop > 0 ? (g.count / pop.totalPop) * 100 : 0;
                    return (
                      <div key={g.grade} className="flex items-center gap-2">
                        <span className="w-8 text-right text-xs font-semibold text-muted">{g.grade}</span>
                        <div className="flex-1 h-5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${g.grade === "10" ? "bg-up" : g.grade === "9" || g.grade === "9.5" ? "bg-accent/70" : "bg-white/20"}`}
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                        <span className="w-14 text-right text-xs tabular">{fmtPop(g.count)}</span>
                        <span className="w-12 text-right text-[10px] text-muted tabular">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
                {pop.graders.length > 1 && (
                  <div className="mt-4 pt-3 border-t border-line">
                    <div className="text-[10px] text-muted uppercase tracking-wider mb-2">By grading company</div>
                    <div className="grid grid-cols-2 gap-2">
                      {pop.graders.map((g) => (
                        <div key={g.name} className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2">
                          <span className="text-xs font-semibold">{g.name}</span>
                          <div className="text-right">
                            <div className="text-xs tabular">{fmtPop(g.total)}</div>
                            <div className="text-[10px] text-muted tabular">{(g.gemRate * 100).toFixed(1)}% gem</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <a href={pop.gemrateUrl} target="_blank" rel="noreferrer" className="block text-[10px] text-muted mt-3 hover:text-accent">
                  Data from GemRate · updated {pop.lastUpdated ?? "weekly"} · PSA + BGS + SGC + CGC ↗
                </a>
              </>
            ) : (
              <div className="text-muted text-center py-3">No population data available</div>
            )}
          </div>
        </Section>
      )}

      <Section title="Details">
        <dl className="card-surface rounded-2xl p-4 grid grid-cols-2 gap-y-2 text-sm">
          <Row k="TCG" v={card.tcg} />
          <Row k="Language" v={card.language.toUpperCase()} />
          <Row k="Set" v={card.setName} />
          <Row k="Number" v={card.cardNumber} />
          <Row k="Rarity" v={card.rarity} />
          <Row k="Released" v={card.releaseDate} />
          {"hp" in meta && meta.hp != null && <Row k="HP" v={String(meta.hp)} />}
          {"types" in meta && meta.types != null && <Row k="Type" v={Array.isArray(meta.types) ? meta.types.join(", ") : String(meta.types)} />}
          {"typeLine" in meta && meta.typeLine != null && <Row k="Type" v={String(meta.typeLine)} />}
          {"artist" in meta && meta.artist != null && <Row k="Artist" v={String(meta.artist)} />}
          {"atk" in meta && meta.atk != null && <Row k="ATK / DEF" v={`${meta.atk} / ${meta.def ?? "—"}`} />}
        </dl>
      </Section>

      {!isSealed && (
        <Section title="eBay Listings">
          <div className="card-surface rounded-2xl p-4 text-sm">
            {ebayLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : ebaySold && (ebaySold.raw.length > 0 || ebaySold.graded.length > 0) ? (
              <>
                {ebaySold.raw.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Raw Near Mint — {ebaySold.raw.length} Listings</div>
                    <div className="space-y-1.5">
                      {ebaySold.raw.map((item, i) => (
                        <a key={i} href={item.itemUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2 hover:bg-white/[0.06]">
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-xs">{item.title}</div>
                            {item.date && <div className="text-[10px] text-muted">{new Date(item.date).toLocaleDateString()}</div>}
                          </div>
                          <div className="font-semibold tabular ml-3 text-accent">{listingPrice(item)}</div>
                        </a>
                      ))}
                    </div>
                  </>
                )}
                {ebaySold.graded.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider mt-4 mb-2">Graded — Recent Listings</div>
                    {ebaySold.graded.map((g) => (
                      <div key={g.grade} className="mb-2">
                        <div className="text-xs font-medium text-muted mb-1">{g.grade}</div>
                        <div className="space-y-1.5">
                          {g.items.map((item, i) => (
                            <a key={i} href={item.itemUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2 hover:bg-white/[0.06]">
                              <div className="flex-1 min-w-0">
                                <div className="truncate text-xs">{item.title}</div>
                                {item.date && <div className="text-[10px] text-muted">{new Date(item.date).toLocaleDateString()}</div>}
                              </div>
                              <div className="font-semibold tabular ml-3 text-accent">{listingPrice(item)}</div>
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
                <div className="text-[10px] text-muted mt-3">Prices from eBay Browse API · updated every 24h</div>
              </>
            ) : (
              <div className="text-muted text-center py-3">
                {ebayLoading ? "Loading…" : "No eBay listings available"}
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Sold listings">
        <div className="card-surface rounded-2xl p-4 space-y-2 text-sm">
          <a href={ebaySoldUrl(card)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2.5 hover:bg-white/[0.06]">
            <span>eBay sold listings{isSealed ? "" : " (raw)"}</span>
            <span className="text-accent">↗</span>
          </a>
          {"tcgplayerUrl" in meta && typeof meta.tcgplayerUrl === "string" && (
            <a href={meta.tcgplayerUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2.5 hover:bg-white/[0.06]">
              <span>TCGPlayer listings</span>
              <span className="text-accent">↗</span>
            </a>
          )}
          {!isSealed && (
            <>
          <div className="mt-3 mb-1 text-xs font-semibold text-muted uppercase tracking-wider">PSA graded sold</div>
          <div className="grid grid-cols-5 gap-1.5">
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((g) => (
              <a key={g} href={ebaySoldUrl(card, `PSA ${g}`)} target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-lg bg-white/[0.03] border border-line py-2 hover:bg-white/[0.06] hover:border-accent/40 transition-colors">
                <span className="text-xs font-semibold">PSA {g}</span>
              </a>
            ))}
          </div>
          <div className="mt-3 mb-1 text-xs font-semibold text-muted uppercase tracking-wider">BGS graded sold</div>
          <div className="grid grid-cols-5 gap-1.5">
            {["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5"].map((g) => (
              <a key={g} href={ebaySoldUrl(card, `BGS ${g}`)} target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-lg bg-white/[0.03] border border-line py-2 hover:bg-white/[0.06] hover:border-accent/40 transition-colors">
                <span className="text-xs font-semibold">BGS {g}</span>
              </a>
            ))}
          </div>
          <div className="mt-3 mb-1 text-xs font-semibold text-muted uppercase tracking-wider">CGC graded sold</div>
          <div className="grid grid-cols-5 gap-1.5">
            {["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5"].map((g) => (
              <a key={g} href={ebaySoldUrl(card, `CGC ${g}`)} target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-lg bg-white/[0.03] border border-line py-2 hover:bg-white/[0.06] hover:border-accent/40 transition-colors">
                <span className="text-xs font-semibold">CGC {g}</span>
              </a>
            ))}
          </div>
            </>
          )}
          <div className="text-xs text-muted mt-2">Opens eBay pre-filtered to sold and completed items, newest first.</div>
        </div>
      </Section>

      <div className="fixed bottom-[92px] inset-x-0 px-4 pointer-events-none">
        <div className="max-w-3xl mx-auto flex justify-end gap-2">
          <button onClick={toggleWishlist} disabled={wishBusy} className={`pointer-events-auto w-12 h-12 rounded-full border flex items-center justify-center text-lg shadow-lg disabled:opacity-50 ${wishlisted ? "bg-down/20 border-down/40 text-down" : "bg-elev border-line text-muted"}`} aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}>
            {wishlisted ? "♥" : "♡"}
          </button>
          <Button variant="rainbow" className="pointer-events-auto shadow-[0_10px_30px_rgba(167,139,250,0.3)]" onClick={() => setAdding(true)}>
            + Add to binder
          </Button>
        </div>
      </div>

      {zoom && (
        <button className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setZoom(false)}>
          {isSealed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/images/${encodeURIComponent(card.id)}?size=high`} alt={card.name} className="max-h-full w-auto rounded-2xl" />
          ) : (
            <CardImage id={card.id} size="high" className="max-h-full w-auto rounded-2xl" alt={card.name} />
          )}
        </button>
      )}
      <AddToPortfolioSheet card={adding ? { id: card.id, name: card.name, setName: card.setName, prices: card.prices, sealed: isSealed } : null} onClose={() => setAdding(false)} />
    </div>
  );
}

function ebaySoldUrl(card: NormalizedCard, grade?: string) {
  const num = (card.cardNumber ?? "").split("/")[0].replace(/^0+(?=\d)/, "");
  const name = card.name.replace(/\s+-\s+\d+\/\d+$/, "");
  const set = (card.setName ?? "").replace(/^Scarlet & Violet[:—]\s*/, "SV ").replace(/^Sword & Shield[:—]\s*/, "SWSH ");
  const terms = [name, set, num, card.language === "jap" ? "japanese" : "", grade ?? "", card.tcg === "pokemon" ? "pokemon" : ""].filter(Boolean).join(" ");
  const u = new URL("https://www.ebay.com/sch/i.html");
  u.searchParams.set("_nkw", terms);
  u.searchParams.set("LH_Sold", "1");
  u.searchParams.set("LH_Complete", "1");
  u.searchParams.set("_sop", "13");
  return u.toString();
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </>
  );
}

function fmtPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
}
