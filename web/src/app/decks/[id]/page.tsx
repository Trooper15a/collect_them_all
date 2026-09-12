"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";
import { Button, CardImage, Empty, Money, Skeleton } from "@/components/ui";
import { haptic } from "@/lib/haptics";

interface DeckCard {
  cardName: string;
  cardId: string | null;
  quantity: number;
  owned: number;
  section: string;
  setCode: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  price: number | null;
}

interface DeckDetail {
  deck: {
    id: number;
    tcg: string;
    name: string;
    source: string;
    author: string | null;
    placing: number | null;
    tournamentName: string | null;
    format: string | null;
  };
  cards: DeckCard[];
  owned: number;
  total: number;
  missingCost: number;
}

export default function DeckDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<DeckDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/decks/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(() => showToast("Failed to load deck", "down"))
      .finally(() => setLoading(false));
  }, [id]);

  async function deleteDeck() {
    if (deleting) return;
    setDeleting(true);
    haptic("heavy");
    try {
      const r = await fetch(`/api/decks/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      showToast("Deck deleted", "info");
      router.push("/decks");
    } catch {
      showToast("Failed to delete", "down");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-12" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-[63/88]" />)}
        </div>
      </div>
    );
  }

  if (!data) return <Empty>Deck not found.</Empty>;

  const { deck, cards, owned, total, missingCost } = data;
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;

  const sections = new Map<string, DeckCard[]>();
  for (const c of cards) {
    const list = sections.get(c.section) ?? [];
    list.push(c);
    sections.set(c.section, list);
  }

  const sectionOrder = ["pokemon", "trainer", "energy", "main", "extra", "side"];
  const sortedSections = [...sections.entries()].sort(
    (a, b) => sectionOrder.indexOf(a[0]) - sectionOrder.indexOf(b[0]),
  );

  return (
    <div>
      <button onClick={() => router.push("/decks")} className="text-xs text-accent font-semibold mb-3 flex items-center gap-1">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
        Back to decks
      </button>

      <header className="card-surface rounded-2xl p-4 mb-4 anim-widget d1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{deck.name}</h1>
            <div className="text-xs text-muted mt-0.5">
              {deck.author && `by ${deck.author}`}
              {deck.placing && ` · #${deck.placing}`}
              {deck.tournamentName && ` · ${deck.tournamentName}`}
            </div>
          </div>
          <Button variant="danger" className="text-xs !py-1.5 !px-3" disabled={deleting} onClick={deleteDeck}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </header>

      {/* Ownership progress */}
      <div className="card-surface rounded-2xl p-4 mb-4 anim-widget d2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">You own {owned}/{total} cards</span>
          <span className={`text-sm font-bold ${pct === 100 ? "text-up" : ""}`}>{pct}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-up" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {missingCost > 0 && (
          <div className="text-xs text-muted mt-2">
            Missing cards cost: <span className="font-semibold text-fg"><Money amount={missingCost} currency="USD" /></span>
          </div>
        )}
      </div>

      {/* Card list by section */}
      {sortedSections.map(([section, sectionCards]) => (
        <div key={section} className="mb-6 anim-widget d3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            {section} ({sectionCards.reduce((a, c) => a + c.quantity, 0)} cards)
          </div>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {sectionCards.map((c, i) => {
              const missing = c.quantity - c.owned;
              return (
                <li key={i} className="flex items-center gap-3 p-3">
                  {c.cardId ? (
                    <Link href={`/cards/${encodeURIComponent(c.cardId)}`}>
                      <CardImage id={c.cardId} className="w-10 rounded-md" alt="" />
                    </Link>
                  ) : (
                    <div className="w-10 h-14 rounded-md bg-white/5 flex items-center justify-center text-[8px] text-muted">?</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {c.quantity}x {c.cardName}
                    </div>
                    <div className="text-xs text-muted">
                      {c.setCode && `${c.setCode} `}
                      {c.cardNumber && `#${c.cardNumber}`}
                    </div>
                  </div>
                  <div className="text-right">
                    {c.owned >= c.quantity ? (
                      <span className="text-xs font-semibold text-up">Owned</span>
                    ) : c.owned > 0 ? (
                      <span className="text-xs font-semibold text-yellow-400">{c.owned}/{c.quantity}</span>
                    ) : (
                      <span className="text-xs font-semibold text-down">Missing{missing > 1 ? ` (${missing})` : ""}</span>
                    )}
                    {c.price != null && missing > 0 && (
                      <div className="text-[10px] text-muted"><Money amount={c.price * missing} currency="USD" /></div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
