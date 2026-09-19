"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scanner } from "@/components/Scanner";
import { Button, CardImage, Empty, Money, Segmented, Skeleton, TcgBadge, inputCls } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { isScanIndexId, type Match } from "@/lib/scanner/matcher";
import { TCGS, type CardSummary } from "@/lib/types";
import { useActiveTcgHydrated, type ActiveTcg } from "@/lib/ui-prefs";
import type { AddSheetCard } from "@/components/AddToPortfolioSheet";

export type DiscoveryCard = AddSheetCard & { imageUrl?: string | null };
type LangFilter = "all" | "eng" | "jap";
export type DiscoverySort = "relevance" | "price-desc" | "price-asc" | "name";

type SortableCard = {
  name: string;
  display?: { amount: number } | null;
  price?: { amount: number } | null;
};

export function sortDiscoveryResults<T extends SortableCard>(cards: readonly T[], sort: DiscoverySort): T[] {
  const sorted = [...cards];
  if (sort === "price-desc") sorted.sort((a, b) => (b.display?.amount ?? b.price?.amount ?? 0) - (a.display?.amount ?? a.price?.amount ?? 0));
  if (sort === "price-asc") sorted.sort((a, b) => (a.display?.amount ?? a.price?.amount ?? 0) - (b.display?.amount ?? b.price?.amount ?? 0));
  if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

export interface CardDiscoveryProps {
  initialTcg?: ActiveTcg;
  compact?: boolean;
  allowCamera?: boolean;
  onSelect(card: DiscoveryCard): void;
}

export function CardDiscovery({ initialTcg, compact = false, allowCamera = true, onSelect }: CardDiscoveryProps) {
  const { tcg: preferredTcg, hydrated } = useActiveTcgHydrated();
  const tcg = initialTcg ?? preferredTcg;
  const ready = initialTcg !== undefined || hydrated;
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<LangFilter>("all");
  const [sort, setSort] = useState<DiscoverySort>("relevance");
  const [results, setResults] = useState<CardSummary[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!ready || !query.trim()) return;
    timer.current = setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&tcg=${tcg}&lang=${lang}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Search failed");
        setResults(payload.cards ?? []);
        setWarnings(payload.warnings ?? []);
      } catch (cause) {
        if ((cause as Error).name !== "AbortError") {
          setResults([]);
          setError(cause instanceof Error ? cause.message : "Search failed");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [lang, query, ready, tcg]);

  useEffect(() => () => abort.current?.abort(), []);

  const sorted = useMemo(() => results ? sortDiscoveryResults(results, sort) : null, [results, sort]);
  const activeLabel = tcg === "all" ? "All games" : TCGS.find((game) => game.id === tcg)?.label ?? tcg;
  const visibleMatches = useMemo(
    () => matches && tcg !== "all" ? matches.filter((match) => match.card.tcg === tcg) : matches,
    [matches, tcg],
  );

  function clearSearch() {
    abort.current?.abort();
    setQuery("");
    setResults(null);
    setLoading(false);
    setError(null);
  }

  function selectResult(card: CardSummary) {
    haptic("medium");
    onSelect({ id: card.id, name: card.name, setName: card.setName, prices: card.prices, imageUrl: card.imageUrl });
  }

  async function selectMatch(match: Match) {
    if (resolvingId) return;
    setResolvingId(match.card.id);
    setError(null);
    try {
      const url = isScanIndexId(match.card.id)
        ? `/api/resolve?id=${encodeURIComponent(match.card.id)}`
        : `/api/cards/${encodeURIComponent(match.card.id)}`;
      const response = await fetch(url);
      const payload = response.ok ? await response.json() : null;
      if (!payload?.card) throw new Error("No priced listing found. Try searching by name.");
      const card = payload.card;
      setMatches(null);
      setScanning(false);
      onSelect({ id: card.id, name: card.name, setName: card.setName, prices: card.prices, imageUrl: card.imageUrl });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resolve that card");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <section aria-label="Card discovery">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className={`${inputCls} pr-9`}
            aria-label="Search cards"
            placeholder="Card name, number, or set code…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value.trim()) clearSearch();
            }}
            autoFocus={compact}
            autoCapitalize="off"
            autoCorrect="off"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" onClick={clearSearch} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 min-h-8 min-w-8 text-muted">✕</button>
          )}
        </div>
        {allowCamera && (
          <Button type="button" onClick={() => setScanning(true)} aria-label="Open camera scanner" className="px-3">
            <CameraIcon />
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted">Game: <span className="font-semibold text-fg">{activeLabel}</span></span>
        <Segmented value={lang} onChange={setLang} size="xs" options={[
          { value: "all", label: "EN + JP" }, { value: "eng", label: "English" }, { value: "jap", label: "Japanese" },
        ]} />
      </div>

      {error && <p className="mt-3 text-sm text-down" role="alert">{error}</p>}
      {warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-muted">⚠ {warning}</p>)}

      <div className="mt-4">
        {!query.trim() && !compact && allowCamera && (
          <button type="button" onClick={() => setScanning(true)} className="card-surface w-full rounded-3xl p-6 text-center">
            <span className="btn-rainbow mx-auto grid h-20 w-20 place-items-center rounded-full"><CameraIcon large /></span>
            <span className="mt-4 block font-semibold">Point your camera at a card</span>
            <span className="mt-1 block text-sm text-muted">English and Japanese cards. Or search by name.</span>
          </button>
        )}
        {loading && results === null && <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-[63/88]" />)}</div>}
        {sorted?.length === 0 && !loading && <Empty>No cards found for &quot;{query}&quot;.</Empty>}
        {!!sorted?.length && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <Segmented value={sort} onChange={setSort} size="xs" options={[
                { value: "relevance", label: "Best" }, { value: "price-desc", label: "$↓" }, { value: "price-asc", label: "$↑" }, { value: "name", label: "A-Z" },
              ]} />
              <span className="text-xs text-muted">{sorted.length} results</span>
            </div>
            <div className={`grid grid-cols-2 gap-3 stagger-children ${compact ? "sm:grid-cols-2" : "sm:grid-cols-3"} ${loading ? "opacity-60" : ""}`}>
              {sorted.map((card) => (
                <article key={card.id} className="card-surface overflow-hidden rounded-2xl">
                  <button type="button" onClick={() => selectResult(card)} className="block w-full text-left" aria-label={`Add ${card.name}`}>
                    <CardImage id={card.id} className="w-full" alt={card.name} directUrl={card.imageUrl} />
                    <span className="block p-2.5">
                      <span className="block line-clamp-2 text-sm font-medium">{card.name}</span>
                      <span className="block truncate text-[11px] text-muted">{card.setName} {card.cardNumber && `#${card.cardNumber}`}</span>
                      <TcgBadge tcg={card.tcg} lang={card.language} />
                      <span className="mt-1 flex items-center justify-between text-sm">
                        <span>{card.price ? <Money amount={card.display?.amount ?? card.price.amount} currency={card.display?.currency ?? card.price.currency} /> : "—"}</span>
                        <span className="rounded-lg bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">Add</span>
                      </span>
                    </span>
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {scanning && !matches && <Scanner onClose={() => setScanning(false)} onMatches={(found) => { haptic("heavy"); setMatches(found); }} lang={lang} />}
      {matches && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal aria-label="Choose a card match">
          <button className="absolute inset-0 bg-black/70" onClick={() => setMatches(null)} aria-label="Close" />
          <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            <p className="mb-3 text-xs text-muted">Is it one of these? Tap to add.</p>
            <ul className="divide-y divide-line">
              {(visibleMatches?.length ? visibleMatches : matches).map((match) => (
                <li key={match.card.id}>
                  <button type="button" onClick={() => void selectMatch(match)} disabled={resolvingId !== null} className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-50">
                    <CardImage id={match.card.id} className="w-12 rounded-md" alt="" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{match.card.name}</span><span className="block truncate text-xs text-muted">{match.card.setName ?? match.card.set} #{match.card.num}</span></span>
                    {resolvingId === match.card.id && <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label="Resolving" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function CameraIcon({ large = false }: { large?: boolean }) {
  return <svg viewBox="0 0 24 24" className={large ? "h-9 w-9" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8" y="7" width="8" height="10" rx="1" /></svg>;
}