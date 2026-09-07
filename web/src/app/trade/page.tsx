"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CardImage, Money, Section } from "@/components/ui";

interface SearchResult {
  id: string;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  tcg: string;
  language: string;
  imageUrl: string | null;
  price: { amount: number; currency: string } | null;
}

interface TradeCard extends SearchResult {
  quantity: number;
}

export default function TradePage() {
  const [giving, setGiving] = useState<TradeCard[]>([]);
  const [getting, setGetting] = useState<TradeCard[]>([]);

  const giveTotal = giving.reduce((s, c) => s + (c.price?.amount ?? 0) * c.quantity, 0);
  const getTotal = getting.reduce((s, c) => s + (c.price?.amount ?? 0) * c.quantity, 0);
  const diff = getTotal - giveTotal;
  const pct = giveTotal > 0 ? ((diff / giveTotal) * 100) : 0;

  const addCard = (side: "give" | "get", card: SearchResult) => {
    const setter = side === "give" ? setGiving : setGetting;
    setter((prev) => {
      const existing = prev.find((c) => c.id === card.id);
      if (existing) return prev.map((c) => c.id === card.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...card, quantity: 1 }];
    });
  };

  const removeCard = (side: "give" | "get", id: string) => {
    const setter = side === "give" ? setGiving : setGetting;
    setter((prev) => prev.filter((c) => c.id !== id));
  };

  const updateQty = (side: "give" | "get", id: string, qty: number) => {
    const setter = side === "give" ? setGiving : setGetting;
    if (qty < 1) { removeCard(side, id); return; }
    setter((prev) => prev.map((c) => c.id === id ? { ...c, quantity: qty } : c));
  };

  const verdict = giving.length === 0 && getting.length === 0
    ? null
    : Math.abs(pct) < 5
      ? { label: "Fair trade", color: "text-up", bg: "bg-up/10" }
      : diff > 0
        ? { label: "You win this trade", color: "text-up", bg: "bg-up/10" }
        : { label: "You lose this trade", color: "text-down", bg: "bg-down/10" };

  return (
    <div className="py-6 space-y-6">
      <h1 className="text-2xl font-bold">Trade Analyzer</h1>
      <p className="text-sm text-muted">Compare card values to evaluate trade fairness. Search and add cards to each side.</p>

      {/* Verdict banner */}
      {verdict && (giveTotal > 0 || getTotal > 0) && (
        <div className={`rounded-xl ${verdict.bg} border border-line p-4 text-center`}>
          <p className={`text-lg font-bold ${verdict.color}`}>{verdict.label}</p>
          <p className="text-sm text-muted mt-1">
            You give <Money amount={giveTotal} currency="USD" /> — You get <Money amount={getTotal} currency="USD" />
            {giveTotal > 0 && (
              <span className={diff >= 0 ? "text-up" : "text-down"}> ({diff >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>
            )}
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <TradeSide
          title="You give"
          cards={giving}
          total={giveTotal}
          onAdd={(c) => addCard("give", c)}
          onRemove={(id) => removeCard("give", id)}
          onQty={(id, q) => updateQty("give", id, q)}
        />
        <TradeSide
          title="You get"
          cards={getting}
          total={getTotal}
          onAdd={(c) => addCard("get", c)}
          onRemove={(id) => removeCard("get", id)}
          onQty={(id, q) => updateQty("get", id, q)}
        />
      </div>
    </div>
  );
}

function TradeSide({
  title, cards, total, onAdd, onRemove, onQty,
}: {
  title: string;
  cards: TradeCard[];
  total: number;
  onAdd: (c: SearchResult) => void;
  onRemove: (id: string) => void;
  onQty: (id: string, qty: number) => void;
}) {
  return (
    <Section title={title}>
      <CardSearch onSelect={onAdd} />
      <div className="mt-3 space-y-2">
        {cards.length === 0 && (
          <p className="text-xs text-muted text-center py-4">Search and add cards above</p>
        )}
        {cards.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-line p-2">
            <CardImage id={c.id} size="low" className="w-10 h-14 rounded-lg object-cover" alt={c.name} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-xs text-muted truncate">{c.setName} {c.cardNumber ? `#${c.cardNumber}` : ""}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onQty(c.id, c.quantity - 1)}
                className="w-6 h-6 rounded-md bg-white/[0.05] text-xs font-bold hover:bg-white/[0.1] transition-colors"
              >
                -
              </button>
              <span className="text-xs font-semibold tabular w-5 text-center">{c.quantity}</span>
              <button
                onClick={() => onQty(c.id, c.quantity + 1)}
                className="w-6 h-6 rounded-md bg-white/[0.05] text-xs font-bold hover:bg-white/[0.1] transition-colors"
              >
                +
              </button>
            </div>
            <div className="text-right shrink-0 w-16">
              <p className="text-xs font-semibold tabular">
                {c.price ? <Money amount={c.price.amount * c.quantity} currency={c.price.currency} /> : "—"}
              </p>
            </div>
            <button onClick={() => onRemove(c.id)} className="text-muted hover:text-down text-sm px-1" aria-label="Remove">&times;</button>
          </div>
        ))}
      </div>
      {cards.length > 0 && (
        <div className="mt-3 flex justify-between items-center border-t border-line pt-3">
          <span className="text-xs text-muted">{cards.reduce((s, c) => s + c.quantity, 0)} cards</span>
          <span className="text-sm font-bold tabular"><Money amount={total} currency="USD" /></span>
        </div>
      )}
    </Section>
  );
}

function CardSearch({ onSelect }: { onSelect: (c: SearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q: string) => {
    clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.cards ?? []);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search cards..."
        className="w-full rounded-lg bg-white/[0.04] border border-line px-3 py-2 text-sm focus:outline-none focus:border-accent"
      />
      {loading && <div className="absolute right-3 top-2.5 text-xs text-muted">...</div>}
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl bg-elev border border-line shadow-xl max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => { onSelect(r); setQuery(""); setResults([]); setOpen(false); }}
              className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
            >
              <CardImage id={r.id} size="low" className="w-8 h-11 rounded object-cover shrink-0" alt={r.name} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{r.name}</p>
                <p className="text-xs text-muted truncate">{r.setName} {r.cardNumber ? `#${r.cardNumber}` : ""}</p>
              </div>
              <span className="text-xs text-muted shrink-0 tabular">
                {r.price ? <Money amount={r.price.amount} currency={r.price.currency} /> : "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
