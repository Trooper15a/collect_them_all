"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { PullToRefresh } from "@/components/PullToRefresh";
import { CardImage, Delta, Empty, Money, Segmented, Skeleton, TcgBadge } from "@/components/ui";
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
      .then((d) => {
        if (!d || !d.summary || !Array.isArray(d.series)) throw new Error("Couldn't load your dashboard. Pull to retry.");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [range]);

  useEffect(load, [load]);

  if (error) return <Empty>{error}</Empty>;
  if (!data)
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-44" />
        <Skeleton className="h-20" />
        <Skeleton className="h-32" />
      </div>
    );

  const s = data.summary;
  const c = data.currency;
  const empty = s.uniqueCount === 0;
  const movers = [...(data.trending ?? [])].slice(0, 5);
  const triggeredAlerts = alerts.filter((a) => a.triggered);

  return (
    <PullToRefresh onRefresh={async () => { await load(); await loadAlerts(); }}>
    <div className="pb-2">
      {/* ── Header ── */}
      <header className="pt-2 pb-1 flex items-baseline justify-between anim-widget d1">
        <h1 className="text-xl font-bold uppercase tracking-wider">RipnPull</h1>
        <span className="text-[11px] text-muted">{c} · fx {data.fxDate}</span>
      </header>

      {/* ── Widget: Portfolio Value ── */}
      <div className="card-surface rounded-3xl p-5 mt-2 anim-widget d1">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted font-medium">Total Value</div>
            <div className="text-4xl font-bold tabular tracking-tight mt-1">
              <Money amount={s.value} currency={c} />
            </div>
          </div>
          {s.change24h !== 0 && (
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold anim-pop ${s.change24h >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
              {s.change24h >= 0 ? "▲" : "▼"} <Money amount={Math.abs(s.change24h)} currency={c} />
            </div>
          )}
        </div>

        <div className="mt-3 -mx-2">
          <PriceChart data={data.series.map((p) => ({ date: p.date, value: p.value }))} currency={c} height={140} />
        </div>
        <div className="mt-2 flex justify-center">
          <Segmented value={range} onChange={setRange} size="xs" options={RANGES.map((r) => ({ value: r, label: r }))} />
        </div>
      </div>

      {/* ── Widget: Key Stats Row ── */}
      <div className="grid grid-cols-3 gap-2 mt-3 anim-widget d2">
        <StatWidget label="Cards" value={s.itemCount} />
        <StatWidget label="Unique" value={s.uniqueCount} />
        <StatWidget label="Binders" value={data.stats?.portfolioCount ?? 0} />
      </div>

      {/* ── Widget: P&L Strip ── */}
      <div className="grid grid-cols-3 gap-2 mt-2 anim-widget d3">
        <div className="card-surface rounded-2xl p-3 text-center">
          <div className="text-[10px] text-muted uppercase tracking-wider">Cost</div>
          <div className="text-sm font-semibold mt-0.5 tabular"><Money amount={s.cost} currency={c} /></div>
        </div>
        <div className="card-surface rounded-2xl p-3 text-center">
          <div className="text-[10px] text-muted uppercase tracking-wider">Gain</div>
          <div className="text-sm font-semibold mt-0.5"><Delta amount={s.cost > 0 ? s.gain : null} currency={c} /></div>
        </div>
        <div className="card-surface rounded-2xl p-3 text-center">
          <div className="text-[10px] text-muted uppercase tracking-wider">All time</div>
          <div className="text-sm font-semibold mt-0.5"><Delta pct={s.gainPct} /></div>
        </div>
      </div>

      {/* ── Widget: Quick Actions ── */}
      <div className="card-surface rounded-3xl p-4 mt-3 anim-widget d4">
        <div className="text-xs text-muted font-medium mb-3">Quick Actions</div>
        <div className="grid grid-cols-4 gap-2 stagger-children">
          <ActionBtn href="/scan" label="Scan">
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
            <rect x="8" y="7" width="8" height="10" rx="1" />
          </ActionBtn>
          <ActionBtn href="/portfolios" label="Binders">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </ActionBtn>
          <ActionBtn href="/sets" label="Sets">
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" />
          </ActionBtn>
          <ActionBtn href="/shop" label="Shop">
            <path d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
            <circle cx="7.5" cy="19.5" r="1.5" />
            <circle cx="17.5" cy="19.5" r="1.5" />
          </ActionBtn>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 stagger-children">
          <ActionBtn href="/grade" label="Grader">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </ActionBtn>
          <ActionBtn href="/wishlist" label="Wishlist">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </ActionBtn>
          <ActionBtn href="/opens" label="Box Opens">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
          </ActionBtn>
        </div>
      </div>

      {/* ── Widget: Triggered Alerts ── */}
      {triggeredAlerts.length > 0 && (
        <div className="card-surface rounded-3xl p-4 mt-3 anim-widget d5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-down anim-pulse" />
            <span className="text-xs text-muted font-medium">{triggeredAlerts.length} Price Alert{triggeredAlerts.length > 1 ? "s" : ""} Triggered</span>
          </div>
          <ul className="space-y-2 stagger-children">
            {triggeredAlerts.slice(0, 3).map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-down/[0.06] p-3 tap-scale">
                <Link href={`/cards/${encodeURIComponent(a.card.id)}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <CardImage id={a.card.id} className="w-10 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{a.card.name}</div>
                    <div className="text-xs text-muted truncate">{a.card.setName}</div>
                  </div>
                </Link>
                <div className="text-right">
                  <div className="font-semibold text-sm"><Money amount={a.currentPrice} currency={a.currency ?? "USD"} /></div>
                  <div className="text-xs"><Delta pct={a.changePct} /></div>
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/alerts/${a.id}`, { method: "POST" });
                    loadAlerts();
                  }}
                  className="text-[10px] text-accent ml-1"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Widget: Collection Progress ── */}
      {!empty && data.stats && data.stats.setsStarted > 0 && (
        <div className="card-surface rounded-3xl p-4 mt-3 anim-widget d5">
          <div className="text-xs text-muted font-medium mb-3">Collection</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">{data.stats.overallPct}% complete</span>
            <span className="text-xs text-muted">{data.stats.setsStarted} sets started</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-accent rounded-full anim-bar" style={{ width: `${data.stats.overallPct}%` }} />
          </div>

          {data.stats.closestSet && (
            <div className="mt-4 rounded-2xl bg-white/[0.03] border border-line p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted">Closest to complete</div>
                <div className="text-xs font-semibold tabular">{data.stats.closestSet.pct}%</div>
              </div>
              <div className="text-sm font-semibold mt-1">{data.stats.closestSet.name}</div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-2">
                <div className="h-full bg-up rounded-full anim-bar" style={{ width: `${data.stats.closestSet.pct}%` }} />
              </div>
              <div className="text-[11px] text-muted mt-1">{data.stats.closestSet.owned}/{data.stats.closestSet.total} · {data.stats.closestSet.missing} to go</div>
            </div>
          )}

          {data.stats.cheapestMissing && (
            <Link href={`/cards/${encodeURIComponent(data.stats.cheapestMissing.id)}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-line p-3 tap-scale hover-lift">
              <CardImage id={data.stats.cheapestMissing.id} className="w-10 rounded-md" alt="" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted uppercase tracking-wider">Cheapest missing</div>
                <div className="text-sm font-medium truncate">{data.stats.cheapestMissing.name}</div>
              </div>
              <div className="text-sm font-semibold"><Money amount={data.stats.cheapestMissing.price} currency={c} /></div>
            </Link>
          )}
        </div>
      )}

      {/* ── Widget: Movers ── */}
      {!empty && movers.length > 0 && (
        <div className="card-surface rounded-3xl p-4 mt-3 anim-widget d6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-muted font-medium">Today&apos;s Movers</div>
            <span className="w-2 h-2 rounded-full bg-up anim-pulse" />
          </div>
          <ul className="space-y-1 stagger-children">
            {movers.map((i) => (
              <li key={i.id}>
                <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] tap-scale">
                  <CardImage id={i.cardId} className="w-9 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="text-[11px] text-muted truncate">{i.setName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular"><Money amount={i.value} currency={c} /></div>
                    <div className="text-xs"><Delta amount={i.change24h != null ? i.change24h * i.quantity : null} pct={i.change24hPct} currency={c} /></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Widget: Most Valuable ── */}
      {!empty && (data.mostValuable ?? []).length > 0 && (
        <div className="card-surface rounded-3xl p-4 mt-3 anim-widget d7">
          <div className="text-xs text-muted font-medium mb-3">Most Valuable</div>
          <ul className="space-y-1 stagger-children">
            {(data.mostValuable ?? []).slice(0, 5).map((i) => (
              <li key={i.id}>
                <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] tap-scale">
                  <CardImage id={i.cardId} className="w-9 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="text-[11px] text-muted truncate">
                      {i.setName} {i.cardNumber && `#${i.cardNumber}`} · x{i.quantity}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular"><Money amount={i.value} currency={c} /></div>
                    <div className="text-xs"><Delta pct={i.change24hPct} /></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Widget: Gains & Losses ── */}
      {!empty && (data.biggestGains.length > 0 || data.biggestLosses.length > 0) && (
        <div className="grid grid-cols-2 gap-2 mt-3 anim-widget d8">
          {data.biggestGains.length > 0 && (
            <div className="card-surface rounded-2xl p-3">
              <div className="text-[10px] text-up font-semibold uppercase tracking-wider mb-2">Top Gains</div>
              <ul className="space-y-2 stagger-children">
                {data.biggestGains.slice(0, 3).map((i) => (
                  <li key={i.id}>
                    <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="flex items-center gap-2 tap-scale">
                      <CardImage id={i.cardId} className="w-7 rounded" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{i.name}</div>
                        <div className="text-[10px]"><Delta pct={i.gainPct} /></div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.biggestLosses.length > 0 && (
            <div className="card-surface rounded-2xl p-3">
              <div className="text-[10px] text-down font-semibold uppercase tracking-wider mb-2">Top Losses</div>
              <ul className="space-y-2 stagger-children">
                {data.biggestLosses.slice(0, 3).map((i) => (
                  <li key={i.id}>
                    <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="flex items-center gap-2 tap-scale">
                      <CardImage id={i.cardId} className="w-7 rounded" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{i.name}</div>
                        <div className="text-[10px]"><Delta pct={i.gainPct} /></div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Non-triggered alerts (compact) ── */}
      {alerts.filter((a) => !a.triggered).length > 0 && (
        <div className="card-surface rounded-3xl p-4 mt-3 anim-widget d8">
          <div className="text-xs text-muted font-medium mb-3">Watching ({alerts.filter((a) => !a.triggered).length})</div>
          <ul className="space-y-1 stagger-children">
            {alerts.filter((a) => !a.triggered).slice(0, 4).map((a) => (
              <li key={a.id}>
                <Link href={`/cards/${encodeURIComponent(a.card.id)}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] tap-scale">
                  <CardImage id={a.card.id} className="w-8 rounded" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.card.name}</div>
                    <div className="text-[11px] text-muted">±{a.thresholdPct}% alert</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular"><Money amount={a.currentPrice} currency={a.currency ?? "USD"} /></div>
                    <div className="text-xs"><Delta pct={a.changePct} /></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Empty state ── */}
      {empty && (
        <div className="mt-6 anim-widget d5">
          <Empty>
            Your collection is empty.{" "}
            <Link href="/scan" className="text-accent font-semibold">
              Scan or search
            </Link>{" "}
            for a card to get started.
          </Empty>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}

/* ── Sub-components ── */

function StatWidget({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-surface rounded-2xl p-3 text-center tap-scale">
      <div className="text-2xl font-bold tabular">{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ActionBtn({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 tap-scale">
      <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </div>
      <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
    </Link>
  );
}
