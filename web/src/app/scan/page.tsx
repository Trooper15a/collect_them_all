"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddToPortfolioSheet, type AddSheetCard } from "@/components/AddToPortfolioSheet";
import { CardDiscovery, type DiscoveryCard } from "@/components/CardDiscovery";
import { Scanner } from "@/components/Scanner";
import { showToast } from "@/components/Toast";
import { Button, CardImage, Money, inputCls } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { isScanIndexId, type Match } from "@/lib/scanner/matcher";
import { TCGS } from "@/lib/types";
import { useActiveTcgHydrated } from "@/lib/ui-prefs";

interface RecentScan { id: string; name: string; setName: string | null; ts: number; }

export default function ScanPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;
  const { tcg } = useActiveTcgHydrated();
  const [scanning, setScanning] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<AddSheetCard[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [adding, setAdding] = useState<AddSheetCard | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [portfolios, setPortfolios] = useState<{ id: number; name: string }[]>([]);
  const [portfoliosError, setPortfoliosError] = useState<string | null>(null);
  const [bulkPortfolioId, setBulkPortfolioId] = useState<number | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [showAllGames, setShowAllGames] = useState(false);
  const [guestQueue, setGuestQueue] = useState<AddSheetCard[]>([]);
  const GUEST_QUEUE_LIMIT = 10;

  // Load persisted state after mount (SSR-safe defaults above avoid hydration mismatch).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time localStorage restore after mount; lazy useState initializers would break SSR/hydration */
    try {
      if (localStorage.getItem("bulkMode") === "1") setBulkMode(true);
      const q = localStorage.getItem("bulkQueue");
      if (q) {
        const parsed = JSON.parse(q);
        if (Array.isArray(parsed)) setBulkQueue(parsed);
      }
      const r = localStorage.getItem("recentScans");
      if (r) {
        const parsed = JSON.parse(r);
        if (Array.isArray(parsed)) setRecentScans(parsed);
      }
      const gq = localStorage.getItem("guestQueue");
      if (gq) {
        const parsed = JSON.parse(gq);
        if (Array.isArray(parsed)) setGuestQueue(parsed);
      }
    } catch { /* corrupt/unavailable storage — keep defaults */ }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    try { localStorage.setItem("recentScans", JSON.stringify(recentScans)); } catch {}
  }, [recentScans]);
  useEffect(() => {
    try { localStorage.setItem("guestQueue", JSON.stringify(guestQueue)); } catch {}
  }, [guestQueue]);

  const loadPortfolios = useCallback(() => {
    fetch("/api/portfolios")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((d) => {
        const list = (d.portfolios ?? []).map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }));
        setPortfolios(list);
        setPortfoliosError(null);
        if (list.length) setBulkPortfolioId((cur) => cur ?? list[0].id);
      })
      .catch(() => setPortfoliosError("Couldn't load your binders."));
  }, []);
  useEffect(() => { if (isLoggedIn) loadPortfolios(); }, [isLoggedIn, loadPortfolios]);
  useEffect(() => {
    try { localStorage.setItem("bulkQueue", JSON.stringify(bulkQueue)); } catch {}
  }, [bulkQueue]);
  useEffect(() => {
    try { localStorage.setItem("bulkMode", bulkMode ? "1" : "0"); } catch {}
  }, [bulkMode]);

  // Scanner matches follow the global game picker: filter hard to the active
  // game, with a fallback to all games when nothing matches it.
  const activeTcgLabel = tcg === "all" ? null : TCGS.find((t) => t.id === tcg)?.label ?? tcg;
  const gameMatches = useMemo(
    () => (matches && tcg !== "all" ? matches.filter((m) => m.card.tcg === tcg) : null),
    [matches, tcg],
  );
  const visibleMatches = gameMatches && gameMatches.length > 0 && !showAllGames ? gameMatches : matches;

  async function resolveMatch(m: Match): Promise<AddSheetCard | null> {
    const url = isScanIndexId(m.card.id) ? `/api/resolve?id=${encodeURIComponent(m.card.id)}` : `/api/cards/${encodeURIComponent(m.card.id)}`;
    const r = await fetch(url);
    const d = r.ok ? await r.json() : null;
    if (d?.card) return { id: d.card.id, name: d.card.name, setName: d.card.setName, prices: d.card.prices };
    return null;
  }

  async function chooseMatch(m: Match) {
    if (resolvingId) return;
    haptic("medium");
    setResolvingId(m.card.id);
    try {
      const card = await resolveMatch(m);
      setMatches(null);
      if (!bulkMode) setScanning(false);
      if (card) {
        // eslint-disable-next-line react-hooks/purity -- event handler (tap on a match row), not render; rule false-positives through the .map() callback
        const scan: RecentScan = { id: card.id, name: card.name, setName: card.setName ?? null, ts: Date.now() };
        setRecentScans((prev) => [scan, ...prev.filter((s) => s.id !== card.id)].slice(0, 10));
        if (!isLoggedIn) {
          if (guestQueue.length < GUEST_QUEUE_LIMIT && !guestQueue.some((c) => c.id === card.id)) {
            setGuestQueue((prev) => [...prev, card]);
          } else if (guestQueue.length >= GUEST_QUEUE_LIMIT) {
            showToast(`Guest limit reached (${GUEST_QUEUE_LIMIT}). Sign in to save more!`, "info");
          }
          setScanning(true);
        } else if (bulkMode) {
          setBulkQueue((prev) => [...prev, card]);
          setScanning(true);
        } else {
          setAdding(card);
        }
      } else {
        setResolveError(`No priced listing found for ${m.card.name ?? m.card.id}. Try searching by name.`);
      }
    } catch {
      showToast("Couldn't add that card — try again", "down");
    } finally {
      setResolvingId(null);
    }
  }

  function handleDiscoveryCard(card: DiscoveryCard) {
    if (isLoggedIn) {
      setAdding(card);
      return;
    }
    if (guestQueue.some((queued) => queued.id === card.id)) {
      showToast("That card is already in your guest queue.", "info");
      return;
    }
    if (guestQueue.length >= GUEST_QUEUE_LIMIT) {
      showToast("Guest limit reached (" + GUEST_QUEUE_LIMIT + "). Sign in to save more!", "info");
      return;
    }
    haptic("medium");
    setGuestQueue((previous) => [...previous, card]);
  }
  return (
    <div>
      <header className="pt-2 pb-3 anim-widget d1">
        <h1 className="text-xl font-bold uppercase tracking-wider">Find a Card</h1>
      </header>

      <CardDiscovery initialTcg={tcg} allowCamera onSelect={handleDiscoveryCard} />

      {isLoggedIn && (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" onClick={() => { setBulkMode(true); setScanning(true); }}>
            Bulk scan
          </Button>
        </div>
      )}
Cannot overwrite variable Error because it is read-only or constant.       {resolveError && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-down" role="alert">
          <span>{resolveError}</span>
          <button type="button" onClick={() => setResolveError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}
      {scanning && !matches && <Scanner onClose={() => { setScanning(false); setBulkMode(false); }} onMatches={(m) => { haptic("heavy"); setShowAllGames(false); setMatches(m); }} bulkMode={bulkMode} bulkCount={bulkQueue.length} lang="all" />}
      {matches && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button className="absolute inset-0 bg-black/70" onClick={() => setMatches(null)} aria-label="Close" />
          <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)] anim-widget d1" style={{ animationName: "slide-up-sheet" }}>
            <div className="text-xs text-muted mb-3">Is it one of these? Tap to add.</div>
            {activeTcgLabel && gameMatches && (
              <div className="text-[11px] text-muted mb-2 flex items-center justify-between gap-2">
                <span>
                  {gameMatches.length > 0
                    ? showAllGames
                      ? "Showing matches from all games"
                      : `Showing ${activeTcgLabel} matches`
                    : `No ${activeTcgLabel} matches — showing all games`}
                </span>
                {gameMatches.length > 0 && (
                  <button type="button" className="text-accent font-semibold" onClick={() => setShowAllGames((v) => !v)}>
                    {showAllGames ? `${activeTcgLabel} only` : "Show all games"}
                  </button>
                )}
              </div>
            )}
            <ul className="divide-y divide-line stagger-children">
              {(visibleMatches ?? []).map((m, i) => (
                <li key={m.card.id}>
                  <button onClick={() => chooseMatch(m)} disabled={resolvingId !== null} className="w-full flex items-center gap-3 py-2.5 text-left disabled:opacity-50">
                    <CardImage id={m.card.id} className="w-12 rounded-md" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium truncate ${i === 0 ? "text-up" : ""}`}>{m.card.name}</div>
                      <div className="text-xs text-muted truncate">
                        {m.card.setName ?? m.card.set} #{m.card.num} · {m.card.lang?.toUpperCase()}
                      </div>
                    </div>
                    {resolvingId === m.card.id ? (
                      <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-label="Resolving" />
                    ) : (
                      <div className="text-xs tabular text-muted">{(m.score * 100).toFixed(0)}%</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="w-full mt-3" onClick={() => setMatches(null)}>
              Scan again
            </Button>
          </div>
        </div>
      )}
      {!isLoggedIn && !scanning && (
        <div className="card-surface rounded-3xl p-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">
              {guestQueue.length > 0 ? `Scanned cards (${guestQueue.length}/${GUEST_QUEUE_LIMIT})` : "Scanning as guest"}
            </h3>
            {guestQueue.length > 0 && (
              <Button variant="ghost" className="text-xs !py-1 !px-2" onClick={() => { setGuestQueue([]); showToast("Queue cleared", "info"); }}>Clear</Button>
            )}
          </div>
          {guestQueue.length > 0 && (
            <>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-3">
                <div className="bg-accent h-1.5 rounded-full transition-all" style={{ width: `${(guestQueue.length / GUEST_QUEUE_LIMIT) * 100}%` }} />
              </div>
              <ul className="divide-y divide-line mb-3">
                {guestQueue.map((c, i) => (
                  <li key={`${c.id}-${i}`} className="flex items-center gap-3 py-2">
                    <Link href={`/cards/${encodeURIComponent(c.id)}`}>
                      <CardImage id={c.id} className="w-10 rounded-md" alt="" />
                    </Link>
                    <Link href={`/cards/${encodeURIComponent(c.id)}`} className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{c.name}</div>
                      <div className="text-xs text-muted truncate">{c.setName}</div>
                    </Link>
                    {c.prices && (() => {
                      const tp = c.prices.tcgplayer ?? c.prices.cardmarket;
                      if (!tp) return null;
                      const variants = tp.variants ?? {};
                      const first = Object.values(variants)[0] as Record<string, number | null> | undefined;
                      const amt = first?.market ?? first?.mid ?? first?.low;
                      if (!amt) return null;
                      return <span className="text-xs tabular text-muted"><Money amount={amt} currency={tp.currency ?? "USD"} /></span>;
                    })()}
                    <button onClick={() => setGuestQueue((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-muted px-1">✕</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted">
                {guestQueue.length >= GUEST_QUEUE_LIMIT
                  ? "Queue full — sign in to save your cards and scan more."
                  : "Sign in to save cards to your collection."}
              </div>
            </div>
            <Link href="/login" className="text-xs font-semibold text-accent px-3 py-1.5 rounded-lg bg-accent/10 whitespace-nowrap">Sign in</Link>
          </div>
        </div>
      )}
      {isLoggedIn && bulkQueue.length > 0 && !scanning && (
        <div className="card-surface rounded-3xl p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Scanned cards ({bulkQueue.length})</h3>
            <div className="flex gap-2">
              {confirmingClear ? (
                <>
                  <Button variant="danger" className="text-xs !py-1.5 !px-3" onClick={() => { setBulkQueue([]); setConfirmingClear(false); showToast("Queue cleared", "info"); }}>Confirm clear</Button>
                  <Button variant="ghost" className="text-xs !py-1.5 !px-3" onClick={() => setConfirmingClear(false)}>Keep</Button>
                </>
              ) : (
                <Button variant="ghost" className="text-xs !py-1.5 !px-3" onClick={() => setConfirmingClear(true)}>Clear</Button>
              )}
              <Button className="text-xs !py-1.5 !px-3" onClick={() => { setAdding(bulkQueue[0]); }}>Add next</Button>
            </div>
          </div>
          {portfoliosError && (
            <div className="text-xs text-down mb-3 flex items-center gap-2">
              <span>{portfoliosError}</span>
              <button type="button" className="underline font-semibold" onClick={loadPortfolios}>Retry</button>
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <select className={`${inputCls} flex-1`} value={bulkPortfolioId ?? ""} onChange={(e) => setBulkPortfolioId(Number(e.target.value))}>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button
              variant="rainbow"
              disabled={bulkAdding || !bulkPortfolioId}
              onClick={async () => {
                if (!bulkPortfolioId || bulkAdding) return;
                setBulkAdding(true);
                setBulkProgress(0);
                const failed: AddSheetCard[] = [];
                let added = 0;
                try {
                  let condition = "NM";
                  let costCurrency = "CAD";
                  try {
                    const settingsRes = await fetch("/api/settings");
                    const settings = settingsRes.ok ? await settingsRes.json() : {};
                    condition = settings.bulkCondition ?? "NM";
                    costCurrency = settings.bulkCurrency ?? "CAD";
                  } catch { /* fall back to defaults */ }

                  const queue = [...bulkQueue];
                  for (let i = 0; i < queue.length; i++) {
                    const card = queue[i];
                    try {
                      const r = await fetch(`/api/portfolios/${bulkPortfolioId}/items`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ cardId: card.id, quantity: 1, variantType: "normal", condition, costCurrency }),
                      });
                      if (r.ok) added++;
                      else failed.push(card);
                    } catch {
                      failed.push(card);
                    }
                    setBulkProgress(i + 1);
                  }
                  setBulkQueue(failed);
                  if (failed.length === 0) showToast(`Added ${added} card${added === 1 ? "" : "s"}`, "up");
                  else showToast(`${added} added, ${failed.length} failed — kept in queue`, "down", { durationMs: 6000 });
                } finally {
                  setBulkAdding(false);
                }
              }}
            >
              {bulkAdding ? `${bulkProgress}/${bulkQueue.length}` : `Add all (${bulkQueue.length})`}
            </Button>
          </div>
          <ul className="divide-y divide-line">
            {bulkQueue.map((c, i) => (
              <li key={`${c.id}-${i}`} className="flex items-center gap-3 py-2">
                <Link href={`/cards/${encodeURIComponent(c.id)}`}>
                  <CardImage id={c.id} className="w-10 rounded-md" alt="" />
                </Link>
                <Link href={`/cards/${encodeURIComponent(c.id)}`} className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  <div className="text-xs text-muted truncate">{c.setName}</div>
                </Link>
                <button onClick={() => setBulkQueue((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-muted px-2">✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recentScans.length > 0 && !scanning && bulkQueue.length === 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Recently scanned</div>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden stagger-children">
            {recentScans.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link href={`/cards/${encodeURIComponent(s.id)}`} className="flex items-center gap-3 p-3 hover:bg-white/[0.03] tap-scale">
                  <CardImage id={s.id} className="w-10 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{s.name}</div>
                    <div className="text-xs text-muted truncate">{s.setName}</div>
                  </div>
                  {isLoggedIn && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAdding({ id: s.id, name: s.name, setName: s.setName, prices: {} });
                    }}
                    className="text-xs font-semibold text-accent px-2 py-1 rounded-lg bg-accent/10"
                  >
                    + Add
                  </button>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isLoggedIn && <AddToPortfolioSheet card={adding} onClose={() => setAdding(null)} onAdded={() => {
        const addedId = adding?.id;
        setAdding(null);
        setBulkQueue((prev) => {
          if (!addedId) return prev;
          const idx = prev.findIndex((c) => c.id === addedId);
          if (idx === -1) return prev;
          const rest = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          if (rest.length > 0) setTimeout(() => setAdding(rest[0]), 300);
          return rest;
        });
      }} />}
    </div>
  );
}
