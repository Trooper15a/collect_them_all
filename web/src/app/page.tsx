"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PriceAlertControl } from "@/components/PriceAlertControl";
import { PriceChart } from "@/components/PriceChart";
import { PullToRefresh } from "@/components/PullToRefresh";
import { FirstBinderMilestone } from "@/components/FirstBinderMilestone";
import { CardImage, Delta, Empty, Money, Skeleton } from "@/components/ui";
import { RANGES, type Range } from "@/lib/format";
import { variantLabel } from "@/lib/types";

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
  variantType: string;
  direction: "drop" | "rise" | "either";
  basePrice: number | null;
  baseCurrency: string | null;
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
  tcgCount: number;
  avgCardValue: number;
  topTcg: { name: string; count: number } | null;
  topTcgByValue: { name: string; value: number } | null;
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
  const [showAllAlerts, setShowAllAlerts] = useState(false);
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
    <div className="dashboard">
      <h1 className="sr-only">Your collection</h1>

      {/* ── Widget: Portfolio Value ── */}
      <section className="dashboard-value" aria-label="Collection value">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>Collection value</span>
          <span className="text-[11px]">{c} · FX {data.fxDate}</span>
        </div>
        <div className="dashboard-amount"><Money amount={s.value} currency={c} /></div>
        <p className="dashboard-change"><Delta amount={s.change24h} currency={c} /><span className="text-muted"> today</span></p>

        <div className="mt-3">
          <PriceChart data={data.series.map((p) => ({ date: p.date, value: p.value }))} currency={c} height={88} fillOpacity={0.08} />
        </div>
        <div className="dashboard-ranges" aria-label="Value history period">
          {RANGES.map((r) => <button type="button" key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r === "ALL" ? "All" : r}</button>)}
        </div>
      </section>

      {/* ── Widget: Stats Showcase ── */}
      <div className="grid grid-cols-2 gap-2 mt-3" aria-label="Collection summary">
        <Stat label="Cards" value={String(s.itemCount)} sub={`${s.uniqueCount} unique`} />
        <Stat label="Binders" value={String(data.stats?.portfolioCount ?? 0)} sub={`${data.stats?.setsStarted ?? 0} sets tracked`} />
        <Stat label="Cost basis" value={<Money amount={s.cost} currency={c} />} sub={s.cost > 0 ? <><Delta amount={s.gain} currency={c} /> vs cost</> : "No cost data"} />
        <Stat label="All-time return" value={<Delta pct={s.gainPct} />} sub={s.cost > 0 ? "Since added" : "Cost data needed"} />
      </div>

      <FirstBinderMilestone itemCount={s.itemCount} />

      {/* ── Widget: Ring Stats ── */}
      {data.stats && (data.stats.tcgCount > 0 || data.stats.avgCardValue > 0) && (
        <div className="dashboard-context">
          <span>{data.stats.tcgCount} card game{data.stats.tcgCount === 1 ? "" : "s"}</span>
          <span>{data.stats.overallPct}% complete</span>
          <span><Money amount={data.stats.avgCardValue} currency={c} /> avg value</span>
        </div>
      )}

      {/* ── Widget: Quick Actions ── */}
      <section className="dashboard-section" aria-label="Quick actions">
        <h2 className="dashboard-heading">Quick actions</h2>
        <div className="dashboard-quick-grid">
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
          <ActionBtn href="/grade" label="Pre-grade">
            <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
            <line x1="12" y1="3" x2="12" y2="21" />
            <line x1="3" y1="12" x2="21" y2="12" />
          </ActionBtn>
          <ActionBtn href="/wishlist" label="Wishlist">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </ActionBtn>
          <ActionBtn href="/opens" label="Box opens">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
          </ActionBtn>
        </div>
      </section>

      {alerts.length > 3 && <button className="mt-3 text-xs text-accent" onClick={() => setShowAllAlerts((value) => !value)}>{showAllAlerts ? "Show fewer alerts" : `Show all alerts (${alerts.length})`}</button>}
      {/* ── Widget: Triggered Alerts ── */}
      {triggeredAlerts.length > 0 && (
        <div className="dashboard-section dashboard-collection">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-down" />
            <span className="text-sm font-medium">{triggeredAlerts.length} Price Alert{triggeredAlerts.length > 1 ? "s" : ""} Triggered</span>
          </div>
          <ul className="space-y-2">
            {triggeredAlerts.slice(0, showAllAlerts ? undefined : 3).map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-down/[0.06] p-3 tap-scale">
                <Link href={`/cards/${encodeURIComponent(a.card.id)}?variant=${encodeURIComponent(a.variantType)}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <CardImage id={a.card.id} className="w-10 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{a.card.name}</div>
                    <div className="text-xs text-muted truncate">{a.card.setName} · {variantLabel(a.variantType)}</div>
                  </div>
                </Link>
                <div className="text-right">
                  <div className="font-medium text-sm"><Money amount={a.currentPrice} currency={a.currency ?? "USD"} /></div>
                  <div className="text-xs"><Delta pct={a.changePct} /></div>
                </div>
                <PriceAlertControl cardId={a.card.id} cardName={a.card.name} initialAlert={a} onChanged={loadAlerts} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Widget: Collection Progress ── */}
      {!empty && data.stats && data.stats.setsStarted > 0 && (
        <div className="dashboard-section dashboard-collection">
          <div className="dashboard-heading">Collection</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{data.stats.overallPct}% complete</span>
            <span className="text-xs text-muted">{data.stats.setsStarted} sets started</span>
          </div>
          <div className="h-1 rounded-full bg-line overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: `${data.stats.overallPct}%` }} />
          </div>

          {data.stats.closestSet && (
            <div className="mt-4 rounded-2xl bg-white/[0.03] border border-line p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted">Closest to complete</div>
                <div className="text-xs font-medium tabular">{data.stats.closestSet.pct}%</div>
              </div>
              <div className="text-sm font-medium mt-1">{data.stats.closestSet.name}</div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-2">
                <div className="h-full bg-up rounded-full" style={{ width: `${data.stats.closestSet.pct}%` }} />
              </div>
              <div className="text-[11px] text-muted mt-1">{data.stats.closestSet.owned}/{data.stats.closestSet.total} · {data.stats.closestSet.missing} to go</div>
            </div>
          )}

          {data.stats.cheapestMissing && (
            <Link href={`/cards/${encodeURIComponent(data.stats.cheapestMissing.id)}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-line p-3 tap-scale hover-lift">
              <CardImage id={data.stats.cheapestMissing.id} className="w-10 rounded-md" alt="" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-muted">Cheapest missing</div>
                <div className="text-sm font-medium truncate">{data.stats.cheapestMissing.name}</div>
              </div>
              <div className="text-sm font-medium"><Money amount={data.stats.cheapestMissing.price} currency={c} /></div>
            </Link>
          )}
        </div>
      )}

      {/* ── Widget: Movers ── */}
      {!empty && movers.length > 0 && (
        <div className="dashboard-section">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Today&apos;s movers</div>
            <span className="w-2 h-2 rounded-full bg-up" />
          </div>
          <ul className="space-y-1 ">
            {movers.map((i) => (
              <li key={i.id}>
                <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="dashboard-row">
                  <CardImage id={i.cardId} className="w-9 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="text-[11px] text-muted truncate">{i.setName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular"><Money amount={i.value} currency={c} /></div>
                    <div className="text-xs"><Delta amount={i.change24h != null ? i.change24h * i.quantity : null} pct={i.change24hPct} currency={c} /></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Widget: Most valuable ── */}
      {!empty && (data.mostValuable ?? []).length > 0 && (
        <div className="dashboard-section">
          <div className="dashboard-heading">Most valuable</div>
          <ul className="space-y-1 ">
            {(data.mostValuable ?? []).slice(0, 5).map((i) => (
              <li key={i.id}>
                <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="dashboard-row">
                  <CardImage id={i.cardId} className="w-9 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="text-[11px] text-muted truncate">
                      {i.setName} {i.cardNumber && `#${i.cardNumber}`} · x{i.quantity}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular"><Money amount={i.value} currency={c} /></div>
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
        <div className="grid grid-cols-2 gap-2 mt-6">
          {data.biggestGains.length > 0 && (
            <div className="card-surface rounded-2xl p-3">
              <div className="text-[11px] text-up font-medium mb-2">Top gains</div>
              <ul className="space-y-2 ">
                {data.biggestGains.slice(0, 3).map((i) => (
                  <li key={i.id}>
                    <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="flex items-center gap-2 tap-scale">
                      <CardImage id={i.cardId} className="w-7 rounded" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{i.name}</div>
                        <div className="text-[11px]"><Delta pct={i.gainPct} /></div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.biggestLosses.length > 0 && (
            <div className="card-surface rounded-2xl p-3">
              <div className="text-[11px] text-down font-medium mb-2">Top losses</div>
              <ul className="space-y-2 ">
                {data.biggestLosses.slice(0, 3).map((i) => (
                  <li key={i.id}>
                    <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="flex items-center gap-2 tap-scale">
                      <CardImage id={i.cardId} className="w-7 rounded" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{i.name}</div>
                        <div className="text-[11px]"><Delta pct={i.gainPct} /></div>
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
        <div className="dashboard-section">
          <div className="dashboard-heading">Watching ({alerts.filter((a) => !a.triggered).length})</div>
          <ul className="space-y-1">
            {alerts.filter((a) => !a.triggered).slice(0, showAllAlerts ? undefined : 4).map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Link href={`/cards/${encodeURIComponent(a.card.id)}?variant=${encodeURIComponent(a.variantType)}`} className="flex flex-1 min-w-0 items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] tap-scale">
                  <CardImage id={a.card.id} className="w-8 rounded" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.card.name}</div>
                    <div className="text-[11px] text-muted">{variantLabel(a.variantType)} · {a.direction === "drop" ? "↓" : a.direction === "rise" ? "↑" : "±"}{a.thresholdPct}% alert</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular"><Money amount={a.currentPrice} currency={a.currency ?? "USD"} /></div>
                    <div className="text-xs"><Delta pct={a.changePct} /></div>
                  </div>
                </Link>
                <PriceAlertControl cardId={a.card.id} cardName={a.card.name} initialAlert={a} onChanged={loadAlerts} />
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
            <Link href="/scan" className="text-accent font-medium">
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

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="dashboard-stat">
      <div className="dashboard-stat-label">{label}</div>
      <div className="dashboard-stat-value">{value}</div>
      <div className="dashboard-stat-meta">{sub}</div>
    </div>
  );
}

function ActionBtn({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="dashboard-action">
      <div className="dashboard-action-icon">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </div>
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </Link>
  );
}
