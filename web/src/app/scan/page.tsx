"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddToPortfolioSheet, type AddSheetCard } from "@/components/AddToPortfolioSheet";
import { CardDiscovery, type DiscoveryCard } from "@/components/CardDiscovery";
import { Scanner } from "@/components/Scanner";
import { PiBulkScanner } from "@/components/PiBulkScanner";
import { clearPiMatch } from "@/lib/scanner/pi-auto";
import { ScanLanguageBadge } from "@/components/ScanLanguageBadge";
import { showToast } from "@/components/Toast";
import { Button, CardImage, Money, inputCls } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { isScanIndexId, scanThumbnailUrl, type Match } from "@/lib/scanner/matcher";
import { useScanPreparation } from "@/lib/scanner/use-scan-preparation";
import { TCGS } from "@/lib/types";
import { useActiveTcgHydrated } from "@/lib/ui-prefs";

interface RecentScan { id: string; name: string; setName: string | null; ts: number; }
interface ScanReview { id: string; matches: Match[]; issue?: string; }

export default function ScanPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;
  const { tcg, hydrated } = useActiveTcgHydrated();
  const prepareScanner = useScanPreparation(tcg, hydrated);
  const [scanning, setScanning] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [standMode, setStandMode] = useState(false);
  const [piMode, setPiMode] = useState(false);
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
  const [storageReady, setStorageReady] = useState(false);
  const [scanResultsOpen, setScanResultsOpen] = useState(false);
  const [pendingScans, setPendingScans] = useState<ScanReview[]>([]);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const GUEST_QUEUE_LIMIT = 10;

  // Load persisted state after mount (SSR-safe defaults above avoid hydration mismatch).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time localStorage restore after mount; lazy useState initializers would break SSR/hydration */
    try {
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("review") === "1") setScanResultsOpen(true);
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("camera") === "pi") {
        setPiMode(true);
        setBulkMode(true);
        setScanning(true);
      }
      if (localStorage.getItem("bulkMode") === "1") setBulkMode(true);
      const reviews = localStorage.getItem("bulkScanReview");
      if (reviews) {
        const parsed = JSON.parse(reviews);
        if (Array.isArray(parsed)) setPendingScans(parsed.filter((entry) => typeof entry?.id === "string" && Array.isArray(entry.matches) && entry.matches.length > 0));
      }
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
    setStorageReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    try { localStorage.setItem("recentScans", JSON.stringify(recentScans)); } catch {}
  }, [recentScans]);
  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem("guestQueue", JSON.stringify(guestQueue)); } catch {}
  }, [guestQueue, storageReady]);

  useEffect(() => {
    if (!storageReady || !isLoggedIn || guestQueue.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- transfer restored browser queue when the session becomes authenticated
    setBulkQueue((previous) => {
      const seen = new Set(previous.map((card) => card.id));
      return [...previous, ...guestQueue.filter((card) => !seen.has(card.id))];
    });
    setGuestQueue([]);
    showToast("Your guest scans are ready to review and save.", "info");
  }, [guestQueue, isLoggedIn, storageReady]);

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
    if (!storageReady) return;
    try { localStorage.setItem("bulkQueue", JSON.stringify(bulkQueue)); } catch {}
  }, [bulkQueue, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem("bulkScanReview", JSON.stringify(pendingScans)); } catch {}
  }, [pendingScans, storageReady]);
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

  async function chooseMatch(m: Match, reviewId: string | null = null) {
    if (resolvingId) return false;
    haptic("medium");
    setResolvingId(m.card.id);
    try {
      const card = await resolveMatch(m);
      setMatches(null);
      if (!bulkMode && !standMode) setScanning(false);
      if (card) {
        const scan: RecentScan = { id: card.id, name: card.name, setName: card.setName ?? null, ts: Date.now() };
        setRecentScans((prev) => [scan, ...prev.filter((s) => s.id !== card.id)].slice(0, 10));
        if (!isLoggedIn) {
          if (guestQueue.length < GUEST_QUEUE_LIMIT && !guestQueue.some((c) => c.id === card.id)) {
            setGuestQueue((prev) => [...prev, card]);
          } else if (guestQueue.length >= GUEST_QUEUE_LIMIT) {
            showToast(`Guest limit reached (${GUEST_QUEUE_LIMIT}). Sign in to save more!`, "info");
          }
          setScanning(true);
        } else if (bulkMode || standMode || reviewId) {
          setBulkQueue((prev) => [...prev, card]);
          if (bulkMode || standMode) setScanning(true);
        } else {
          setAdding(card);
        }
        if (reviewId) setPendingScans((previous) => previous.filter((scan) => scan.id !== reviewId));
        setActiveReviewId(null);
        return true;
      } else {
        setResolveError(`No priced listing found for ${m.card.name ?? m.card.id}. Try searching by name.`);
      }
    } catch {
      showToast("Couldn't add that card — try again", "down");
    } finally {
      setResolvingId(null);
    }
    return false;
  }

  function finishScanning(notice?: string) {
    setScanning(false); setPiMode(false); setBulkMode(false); setStandMode(false);
    setMatches(null); setActiveReviewId(null); setSaveSummary(""); setScanResultsOpen(true);
    setScanNotice(notice ?? "");
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/scan?review=1");
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
    <div onPointerDownCapture={prepareScanner} onFocusCapture={prepareScanner} onTouchStartCapture={prepareScanner}>
      <header className="pt-2 pb-3 anim-widget d1">
        <h1 className="text-xl font-bold uppercase tracking-wider">Find a Card</h1>
      </header>

      <CardDiscovery initialTcg={tcg} allowCamera onSelect={handleDiscoveryCard} />
      {(bulkQueue.length > 0 || pendingScans.length > 0) && <Button className="mt-3" onClick={() => finishScanning()}>Review scanned cards ({bulkQueue.length + pendingScans.length})</Button>}

      {isLoggedIn && (
        <div className="mt-3 flex justify-end gap-2">
          <a href="/scan?camera=pi" className="self-center text-sm font-semibold text-accent underline">Pi bulk scan</a>
          <Button variant="ghost" onClick={() => { setPiMode(false); setBulkMode(true); setStandMode(false); setScanning(true); }}>
            Bulk scan
          </Button>
          <Button variant="ghost" onClick={() => { setPiMode(false); setStandMode(true); setBulkMode(false); setScanning(true); }}>
            Stand scan
          </Button>
        </div>
      )}
      {resolveError && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-down" role="alert">
          <span>{resolveError}</span>
          <button type="button" onClick={() => setResolveError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}
      {scanning && piMode && <PiBulkScanner onClose={finishScanning} onMatches={async (m, automatic, capture) => {
        haptic("heavy"); setShowAllGames(false);
        const reviewId = capture?.captureId ?? crypto.randomUUID();
        setPendingScans((previous) => [...previous.filter((scan) => scan.id !== reviewId), { id: reviewId, matches: m, issue: capture?.issue }]);
        const clear = automatic && !capture?.issue && isLoggedIn ? clearPiMatch(m) : null;
        if (clear) return await chooseMatch(clear, reviewId);
        setActiveReviewId(reviewId); setMatches(m);
      }} paused={!!matches || resolvingId !== null} count={bulkQueue.length} reviewCount={pendingScans.length} tcg={tcg} lang="all" />}
      {scanning && !piMode && (!matches || standMode) && <Scanner onClose={() => { setScanning(false); setBulkMode(false); setStandMode(false); }} onMatches={(m) => { haptic("heavy"); setShowAllGames(false); setMatches(m); }} paused={!!matches} bulkMode={bulkMode} standMode={standMode} bulkCount={bulkQueue.length} lang="all" />}
      {matches && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button className="absolute inset-0 bg-black/70" onClick={() => { setMatches(null); setActiveReviewId(null); }} aria-label="Close" />
          <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)] anim-widget d1" style={{ animationName: "slide-up-sheet" }}>
            {pendingScans.find((scan) => scan.id === activeReviewId)?.issue && <p role="alert" className="text-sm text-down mb-3">Framing needs review: {pendingScans.find((scan) => scan.id === activeReviewId)?.issue}</p>}
            <div className="text-xs text-muted mb-3">Compare the image, language, set and number. Confirm the finish before saving; match scores are similarity only.</div>
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
                  <button onClick={() => chooseMatch(m, activeReviewId)} disabled={resolvingId !== null} className="w-full flex items-center gap-3 py-2.5 text-left disabled:opacity-50">
                    <CardImage id={m.card.id} directUrl={scanThumbnailUrl(m.card)} eager priority={i < 2} className="w-12 rounded-md" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium truncate ${i === 0 ? "text-up" : ""}`}>{m.card.name}</div>
                      <div className="text-xs text-muted truncate">
                        {m.card.setName ?? m.card.set} #{m.card.num}
                      </div>
                      <ScanLanguageBadge language={m.card.lang} />
                    </div>
                    {resolvingId === m.card.id ? (
                      <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-label="Resolving" />
                    ) : (
                      <div className="text-xs tabular text-muted" title="Image similarity, not a probability of a correct match">{(m.score * 100).toFixed(0)}% similarity</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="w-full mt-3" onClick={() => { setMatches(null); setActiveReviewId(null); }}>
              {activeReviewId ? "Review later" : "Scan again"}
            </Button>
            {activeReviewId && <Button variant="ghost" className="w-full mt-2" onClick={() => {
              setPendingScans((previous) => previous.filter((scan) => scan.id !== activeReviewId)); setActiveReviewId(null); setMatches(null);
            }}>Ignore this capture</Button>}
          </div>
        </div>
      )}
      {scanResultsOpen && !isLoggedIn && <div className="fixed inset-0 z-[45] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Scan results">
        <button className="absolute inset-0 bg-black/70" onClick={() => setScanResultsOpen(false)} aria-label="Close scan results" />
        <section className="relative card-surface rounded-3xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto">
          <h2 className="font-semibold">Scanned cards ({guestQueue.length + pendingScans.length})</h2>
          {guestQueue.length === 0 && pendingScans.length === 0 && <p className="text-sm text-muted mt-3">No cards were queued.</p>}
          <ul className="divide-y divide-line my-3">
            {guestQueue.map((card, index) => <li key={`${card.id}-${index}`} className="py-2 text-sm">{card.name}</li>)}
            {pendingScans.map((scan) => <li key={scan.id} className="py-2 text-sm">{scan.matches[0].card.name ?? "Identified card"} · Needs confirmation</li>)}
          </ul>
          <p className="text-sm text-muted mb-3">Sign in to review these cards and choose a destination binder.</p>
          <Link href="/login?callbackUrl=%2Fscan%3Freview%3D1" className="text-accent underline">Sign in to save your scans</Link>
          <Button variant="ghost" className="ml-3" onClick={() => setScanResultsOpen(false)}>Close</Button>
        </section>
      </div>}
      {!isLoggedIn && !scanning && !scanResultsOpen && (
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
            <Link href="/login?callbackUrl=%2Fscan" className="text-xs font-semibold text-accent px-3 py-1.5 rounded-lg bg-accent/10 whitespace-nowrap">Sign in to save</Link>
          </div>
        </div>
      )}
      {isLoggedIn && (bulkQueue.length > 0 || pendingScans.length > 0 || scanResultsOpen) && !scanning && (
        <div className={scanResultsOpen ? "fixed inset-0 z-[45] flex items-center justify-center p-4" : ""} role={scanResultsOpen ? "dialog" : undefined} aria-modal={scanResultsOpen || undefined} aria-label="Scan results">
        {scanResultsOpen && <button className="absolute inset-0 bg-black/70" onClick={() => setScanResultsOpen(false)} aria-label="Close scan results" />}
        <div className={`card-surface rounded-3xl p-4 mt-4 ${scanResultsOpen ? "relative w-full max-w-lg max-h-[85vh] overflow-y-auto" : ""}`}>
          {scanResultsOpen && <Button variant="ghost" className="float-right" onClick={() => setScanResultsOpen(false)}>Close</Button>}
          <div className="flex items-center justify-between mb-3">
            <div><h3 className="text-sm font-semibold">Scanned cards ({bulkQueue.length + pendingScans.length})</h3><p className="text-xs text-muted">{bulkQueue.length} ready to save · {pendingScans.length} need confirmation. Choose a binder below, then save your cards.</p></div>
            <div className="flex gap-2">
              {confirmingClear ? (
                <>
                  <Button variant="danger" className="text-xs !py-1.5 !px-3" onClick={() => { setBulkQueue([]); setPendingScans([]); setConfirmingClear(false); showToast("Queue cleared", "info"); }}>Confirm clear</Button>
                  <Button variant="ghost" className="text-xs !py-1.5 !px-3" onClick={() => setConfirmingClear(false)}>Keep</Button>
                </>
              ) : (
                <Button variant="ghost" className="text-xs !py-1.5 !px-3" onClick={() => setConfirmingClear(true)}>Clear</Button>
              )}
              <Button disabled={!bulkQueue.length} className="text-xs !py-1.5 !px-3" onClick={() => { setAdding(bulkQueue[0]); }}>Add next</Button>
            </div>
          </div>
          {scanNotice && <p className="text-sm text-down mb-3" role="alert">Scanner stopped: {scanNotice}</p>}
          {saveSummary && <p className="text-sm text-up mb-3" role="status">{saveSummary}</p>}
          {bulkQueue.length === 0 && pendingScans.length === 0 && !saveSummary && <p className="text-sm text-muted mb-3">No cards were queued. Keep each card in place until the ready/review count increases, then remove it and wait for Ready before the next card.</p>}
          {pendingScans.map((scan) => <div key={scan.id} className="flex items-center gap-3 py-2 border-b border-line">
            <CardImage id={scan.matches[0].card.id} directUrl={scanThumbnailUrl(scan.matches[0].card)} className="w-10 rounded-md" alt="" />
            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{scan.matches[0].card.name ?? "Identified card"}</p><p className="text-xs text-muted">Needs confirmation{scan.issue ? ` · ${scan.issue}` : ""}</p></div>
            <Button variant="ghost" onClick={() => { setActiveReviewId(scan.id); setMatches(scan.matches); }}>Review match</Button>
            <button aria-label="Remove unconfirmed capture" onClick={() => setPendingScans((previous) => previous.filter((item) => item.id !== scan.id))}>✕</button>
          </div>)}
          {portfoliosError && (
            <div className="text-xs text-down mb-3 flex items-center gap-2">
              <span>{portfoliosError}</span>
              <button type="button" className="underline font-semibold" onClick={loadPortfolios}>Retry</button>
            </div>
          )}
          <p className="text-xs text-muted my-3">Review variant and condition with Add next, or use Add all with your bulk defaults.</p>
          <label htmlFor="scan-destination" className="block text-xs font-semibold mb-2">Add cards to this binder</label>
          <div className="flex gap-2 mb-3">
            <select id="scan-destination" aria-label="Destination binder" className={`${inputCls} flex-1`} value={bulkPortfolioId ?? ""} onChange={(e) => setBulkPortfolioId(Number(e.target.value))}>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button
              variant="rainbow"
              disabled={bulkAdding || !bulkPortfolioId || bulkQueue.length === 0}
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
                  if (added > 0) setSaveSummary(`Added ${added} card${added === 1 ? "" : "s"} to ${portfolios.find((binder) => binder.id === bulkPortfolioId)?.name ?? "your binder"}.`);
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
