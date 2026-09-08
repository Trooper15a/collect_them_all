"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AddToPortfolioSheet, type AddSheetCard } from "@/components/AddToPortfolioSheet";
import { BackLink } from "@/components/BackLink";
import { SetLogo } from "@/components/SetLogo";
import { CardImage, Empty, Money, Segmented, Skeleton } from "@/components/ui";
import { langLabel } from "@/lib/format";
import { tcgplayerSearchUrl } from "@/lib/marketplace";

interface SetCard {
  id: string;
  name: string;
  cardNumber: string | null;
  rarity: string | null;
  price: number | null;
  owned: number;
}
interface SealedProduct {
  id: string;
  name: string;
  price: number | null;
  owned: number;
}
interface Data {
  set: { id: string; code: string; name: string; language: string; tcg: string; releaseDate: string | null };
  currency: string;
  cards: SetCard[];
  sealed?: SealedProduct[];
  completion: { owned: number; total: number; pct: number; missingCost: number; totalValue: number };
}

type Sort = "number" | "name" | "price-desc" | "price-asc";

export default function SetPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "owned" | "missing">("all");
  const [sort, setSort] = useState<Sort>("number");
  const [adding, setAdding] = useState<AddSheetCard | null>(null);

  const load = () =>
    fetch(`/api/sets/${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cards = useMemo(() => {
    if (!data) return [];
    const filtered = data.cards.filter((x) => (filter === "all" ? true : filter === "owned" ? x.owned > 0 : x.owned === 0));
    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "price-desc") sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    else if (sort === "price-asc") sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    return sorted;
  }, [data, filter, sort]);

  if (error) return <Empty>{error}</Empty>;
  if (!data)
    return (
      <div className="pt-4 space-y-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  const { set, completion: c, currency } = data;
  const sealed = data.sealed ?? [];

  return (
    <div>
      <header className="pt-2 pb-3 flex items-center gap-3">
        <BackLink fallback="/sets" label="Sets" />
      </header>
      <div className="card-surface rounded-3xl p-4 flex items-center gap-4">
        <SetLogo id={set.id} code={set.code} className="w-20 h-14" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight">{set.name}</h1>
          <div className="text-xs text-muted">
            {set.code.toUpperCase()} · {langLabel(set.language)} {set.releaseDate && `· ${set.releaseDate}`}
          </div>
        </div>
      </div>

      <div className="card-surface rounded-3xl p-4 mt-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs text-muted">Completion</div>
          <div className="text-sm font-semibold tabular">
            {c.owned} / {c.total} · {c.pct.toFixed(0)}%
          </div>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full bg-up" style={{ width: `${c.pct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
            <div className="text-[10px] text-muted uppercase tracking-wider">Cost to complete</div>
            <div className="text-sm font-semibold">
              <Money amount={c.missingCost} currency={currency} />
            </div>
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
            <div className="text-[10px] text-muted uppercase tracking-wider">Full set value</div>
            <div className="text-sm font-semibold">
              <Money amount={c.totalValue} currency={currency} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-between items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          size="xs"
          options={[
            { value: "all", label: "All" },
            { value: "owned", label: "Owned" },
            { value: "missing", label: "Missing" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Segmented
            value={sort}
            onChange={setSort}
            size="xs"
            options={[
              { value: "number", label: "#" },
              { value: "name", label: "Name" },
              { value: "price-desc", label: "$↓" },
              { value: "price-asc", label: "$↑" },
            ]}
          />
          <span className="text-xs text-muted">{cards.length}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
        {cards.map((card) => (
          <div key={card.id} className={`card-surface rounded-xl overflow-hidden relative ${card.owned ? "" : "opacity-70"}`}>
            <Link href={`/cards/${encodeURIComponent(card.id)}`}>
              <CardImage id={card.id} className="w-full" alt={card.name} />
            </Link>
            {card.owned > 0 && <div className="absolute top-1 right-1 rounded-full bg-up text-black text-[10px] font-bold px-1.5">×{card.owned}</div>}
            <div className="p-1.5">
              <div className="text-[11px] font-medium leading-tight line-clamp-1">{card.name}</div>
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>#{card.cardNumber}</span>
                <span className="tabular">{card.price != null ? <Money amount={card.price} currency={currency} /> : "—"}</span>
              </div>
              <button onClick={() => setAdding({ id: card.id, name: card.name, setName: set.name })} className="mt-1 w-full min-h-8 text-[11px] font-semibold text-accent bg-accent/10 rounded-md py-1">
                {card.owned > 0 ? "+ More" : "+ Add"}
              </button>
              {card.owned === 0 && (
                <a href={tcgplayerSearchUrl(card.name)} target="_blank" rel="noreferrer" className="mt-0.5 flex w-full min-h-8 items-center justify-center text-center text-[11px] text-muted hover:text-accent">
                  Buy ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      {sealed.length > 0 && (
        <>
          <h2 className="mt-5 text-xs font-semibold text-muted uppercase tracking-wider">Sealed products · {sealed.length}</h2>
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {sealed.map((p) => (
              <div key={p.id} className={`card-surface rounded-xl overflow-hidden relative ${p.owned ? "" : "opacity-70"}`}>
                <Link href={`/cards/${encodeURIComponent(p.id)}`}>
                  {/* sealed product shots aren't card-shaped — keep natural aspect */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/images/${encodeURIComponent(p.id)}?size=low`} alt={p.name} loading="lazy" className="w-full aspect-square object-contain bg-elev" />
                </Link>
                {p.owned > 0 && <div className="absolute top-1 right-1 rounded-full bg-up text-black text-[10px] font-bold px-1.5">×{p.owned}</div>}
                <div className="p-1.5">
                  <div className="text-[11px] font-medium leading-tight line-clamp-2">{p.name}</div>
                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <span>Sealed</span>
                    <span className="tabular">{p.price != null ? <Money amount={p.price} currency={currency} /> : "—"}</span>
                  </div>
                  <button onClick={() => setAdding({ id: p.id, name: p.name, setName: set.name, sealed: true })} className="mt-1 w-full min-h-8 text-[11px] font-semibold text-accent bg-accent/10 rounded-md py-1">
                    {p.owned > 0 ? "+ More" : "+ Add"}
                  </button>
                  {p.owned === 0 && (
                    <a href={tcgplayerSearchUrl(p.name)} target="_blank" rel="noreferrer" className="mt-0.5 flex w-full min-h-8 items-center justify-center text-center text-[11px] text-muted hover:text-accent">
                      Buy ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <AddToPortfolioSheet
        card={adding}
        onClose={() => setAdding(null)}
        onAdded={() => {
          setAdding(null);
          load();
        }}
      />
    </div>
  );
}
