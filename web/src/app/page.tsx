"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { CardImage, Delta, Empty, Money, Section, Segmented, Skeleton, TcgBadge } from "@/components/ui";
import { RANGES, type Range } from "@/lib/format";

interface SlimItem {
  id: number;
  cardId: string;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  language: string;
  tcg: string;
  portfolioName: string;
  quantity: number;
  value: number;
  gain: number | null;
  gainPct: number | null;
  change24h: number | null;
  change24hPct: number | null;
}

interface AlertRow {
  id: number;
  card: { id: string; name: string; setName: string | null; cardNumber: string | null; tcg: string; language: string };
  thresholdPct: number;
  basePrice: number | null;
  currentPrice: number | null;
  currency: string | null;
  changePct: number | null;
  triggered: boolean;
}

interface Stats {
  totalCards: number;
  uniqueCards: number;
  portfolioCount: number;
  closestSet: { name: string; owned: number; total: number; pct: number; missing: number } | null;
  cheapestMissing: { id: string; name: string; setName: string | null; price: number } | null;
  overallPct: number;
  setsStarted: number;
}

interface Dashboard {
  currency: string;
  summary: { value: number; cost: number; gain: number; gainPct: number | null; itemCount: number; uniqueCount: number; change24h: number; change24hPct: number | null };
  series: { date: string; value: number; cost: number }[];
  mostValuable: SlimItem[];
  trending: SlimItem[];
  biggestGains: SlimItem[];
  biggestLosses: SlimItem[];
  stats: Stats;
  fxDate: string;
}

export default function HomePage() {
  const [range, setRange] = useState<Range>("1M");
  const [data, setData] = useState<Dashboard | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const loadAlerts = () =>
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => undefined);
  useEffect(() => {
    loadAlerts();
  }, []);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/dashboard?range=${range}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [range]);

  useEffect(load, [load]);

  if (error) return <Empty>{error}</Empty>;
  if (!data)
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-44" />
        <Skeleton className="h-40" />
      </div>
    );

  const s = data.summary;
  const c = data.currency;
  const empty = s.uniqueCount === 0;

  return (
    <div>
      <header className="pt-2 pb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-bold uppercase tracking-wider">My Binder</h1>
        <span className="text-[11px] text-muted">{c} · fx {data.fxDate}</span>
      </header>

      <div className="card-surface rounded-3xl p-5 mt-2">
        <div className="text-4xl font-bold tabular tracking-tight">
          <Money amount={s.value} currency={c} />
        </div>
        {s.change24h !== 0 && (
          <div className={`inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full text-xs font-semibold ${s.change24h >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
            {s.change24h >= 0 ? "▲" : "▼"} <Money amount={Math.abs(s.change24h)} currency={c} /> today
          </div>
        )}
        <div className="mt-3 -mx-2">
          <PriceChart data={data.series.map((p) => ({ date: p.date, value: p.value }))} currency={c} height={150} />
        </div>
        <div className="mt-2 flex justify-center">
          <Segmented value={range} onChange={setRange} size="xs" options={RANGES.map((r) => ({ value: r, label: r }))} />
        </div>
        <div className="mt-4 flex items-center justify-center gap-6 text-center">
          <div>
            <div className="text-2xl font-bold tabular">{s.itemCount}</div>
            <div className="text-[10px] text-muted uppercase tracking-wider">Cards</div>
          </div>
          <div className="w-px h-8 bg-line" />
          <div>
            <div className="text-2xl font-bold tabular">{s.uniqueCount}</div>
            <div className="text-[10px] text-muted uppercase tracking-wider">Unique</div>
          </div>
          <div className="w-px h-8 bg-line" />
          <div>
            <div className="text-2xl font-bold tabular">{data.stats?.portfolioCount ?? 0}</div>
            <div className="text-[10px] text-muted uppercase tracking-wider">Binders</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Cost basis" value={<Money amount={s.cost} currency={c} />} />
          <Stat label="Net gain" value={<Delta amount={s.cost > 0 ? s.gain : null} currency={c} />} />
          <Stat label="All time" value={<Delta pct={s.gainPct} />} />
        </div>
      </div>

      {!empty && data.stats && (
        <div className="card-surface rounded-3xl p-4 mt-3">
          {data.stats.setsStarted > 0 && (
            <div className="mb-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-medium">Overall collection</div>
                <div className="text-xs text-muted tabular">{data.stats.overallPct}% across {data.stats.setsStarted} sets</div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${data.stats.overallPct}%` }} />
              </div>
            </div>
          )}
          {data.stats.closestSet && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-medium">Closest to complete</div>
                <div className="text-xs text-muted tabular">{data.stats.closestSet.owned}/{data.stats.closestSet.total} · {data.stats.closestSet.pct}%</div>
              </div>
              <div className="text-sm font-semibold mt-1">{data.stats.closestSet.name}</div>
              <div className="mt-2 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${data.stats.closestSet.pct}%` }} />
              </div>
              <div className="text-xs text-muted mt-1">{data.stats.closestSet.missing} cards to go</div>
            </div>
          )}
          {data.stats.cheapestMissing && (
            <Link href={`/cards/${encodeURIComponent(data.stats.cheapestMissing.id)}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-line p-3">
              <CardImage id={data.stats.cheapestMissing.id} className="w-10 rounded-md" alt="" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted uppercase tracking-wider">Cheapest missing</div>
                <div className="text-sm font-medium truncate">{data.stats.cheapestMissing.name}</div>
              </div>
              <div className="text-sm font-semibold">
                <Money amount={data.stats.cheapestMissing.price} currency={c} />
              </div>
            </Link>
          )}
        </div>
      )}

      <Section title="Discover">
        <div className="grid grid-cols-3 gap-2">
          <Link href="/sets" className="card-surface rounded-2xl p-4 text-center hover:bg-white/[0.03] border border-line">
            <div className="w-10 h-10 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="7" height="7" rx="1.5" />
                <rect x="13" y="4" width="7" height="7" rx="1.5" />
                <rect x="4" y="13" width="7" height="7" rx="1.5" />
                <rect x="13" y="13" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <div className="text-xs font-medium mt-2">Browse Sets</div>
          </Link>
          <Link href="/wishlist" className="card-surface rounded-2xl p-4 text-center hover:bg-white/[0.03] border border-line">
            <div className="w-10 h-10 mx-auto rounded-full bg-down/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-down" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <div className="text-xs font-medium mt-2">Wishlist</div>
          </Link>
          <Link href="/opens" className="card-surface rounded-2xl p-4 text-center hover:bg-white/[0.03] border border-line">
            <div className="w-10 h-10 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
              </svg>
            </div>
            <div className="text-xs font-medium mt-2">Box Opens</div>
          </Link>
        </div>
      </Section>

      {alerts.length > 0 && (
        <Section title={`Price alerts${alerts.some((a) => a.triggered) ? ` · ${alerts.filter((a) => a.triggered).length} triggered` : ""}`}>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {alerts.map((a) => (
              <li key={a.id} className={`flex items-center gap-3 p-3 ${a.triggered ? "bg-accent/[0.06]" : ""}`}>
                <Link href={`/cards/${encodeURIComponent(a.card.id)}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <CardImage id={a.card.id} className="w-10 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {a.triggered && <span className="mr-1">🔔</span>}
                      {a.card.name}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {a.card.setName} {a.card.cardNumber && `#${a.card.cardNumber}`} · ±{a.thresholdPct}% from <Money amount={a.basePrice} currency={a.currency ?? "USD"} />
                    </div>
                  </div>
                </Link>
                <div className="text-right">
                  <div className="font-semibold">
                    <Money amount={a.currentPrice} currency={a.currency ?? "USD"} />
                  </div>
                  <div className="text-xs">
                    <Delta pct={a.changePct} />
                  </div>
                  {a.triggered && (
                    <button
                      onClick={async () => {
                        await fetch(`/api/alerts/${a.id}`, { method: "POST" });
                        loadAlerts();
                      }}
                      className="text-[10px] text-accent"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Quick actions">
        <div className="grid grid-cols-3 gap-3">
          <Link href="/portfolios" className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <path d="M12 11v6M9 14h6" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-center">Create Binder</span>
          </Link>
          <Link href="/grade" className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-center">Grade Estimator</span>
          </Link>
          <Link href="/shop" className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
                <circle cx="7.5" cy="19.5" r="1.5" />
                <circle cx="17.5" cy="19.5" r="1.5" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-center">Shop</span>
          </Link>
        </div>
      </Section>

      {empty ? (
        <div className="mt-6">
          <Empty>
            Your collection is empty.{" "}
            <Link href="/scan" className="text-accent font-semibold">
              Scan or search
            </Link>{" "}
            for a card to get started.
          </Empty>
        </div>
      ) : (
        <>
          <Section title="Most valuable">
            <ItemList items={data.mostValuable} currency={c} mode="value" />
          </Section>
          <Section title="Trending today">
            {data.trending.length ? <ItemList items={data.trending} currency={c} mode="change" /> : <Empty>Price movements appear after the first daily refresh.</Empty>}
          </Section>
          {data.biggestGains.length > 0 && (
            <Section title="Biggest gains">
              <ItemList items={data.biggestGains} currency={c} mode="gain" />
            </Section>
          )}
          {data.biggestLosses.length > 0 && (
            <Section title="Biggest losses">
              <ItemList items={data.biggestLosses} currency={c} mode="gain" />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ItemList({ items, currency, mode }: { items: SlimItem[]; currency: string; mode: "value" | "change" | "gain" }) {
  return (
    <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="flex items-center gap-3 p-3 hover:bg-white/[0.03]">
            <CardImage id={i.cardId} className="w-10 rounded-md" alt="" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{i.name}</div>
              <div className="text-xs text-muted truncate">
                {i.setName} {i.cardNumber && `#${i.cardNumber}`} · ×{i.quantity}
              </div>
              <TcgBadge tcg={i.tcg} lang={i.language} />
            </div>
            <div className="text-right">
              <div className="font-semibold">
                <Money amount={i.value} currency={currency} />
              </div>
              <div className="text-xs">
                {mode === "change" && <Delta amount={i.change24h != null ? i.change24h * i.quantity : null} pct={i.change24hPct} currency={currency} />}
                {mode === "gain" && <Delta amount={i.gain} pct={i.gainPct} currency={currency} />}
                {mode === "value" && <Delta pct={i.change24hPct} />}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
