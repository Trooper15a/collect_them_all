"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CardImage, Empty, Money, Section, Skeleton } from "@/components/ui";

interface WishlistItem {
  id: number;
  card: { id: string; name: string; setName?: string | null; cardNumber?: string | null; tcg: string; language: string };
  targetPrice: number | null;
  targetCurrency: string | null;
  currentPrice: number | null;
  currentCurrency: string | null;
  belowTarget: boolean;
}

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[] | null>(null);

  const load = () =>
    fetch("/api/wishlist")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));

  useEffect(() => {
    load();
  }, []);

  const remove = async (cardId: string) => {
    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
    });
    load();
  };

  return (
    <div>
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold uppercase tracking-wider">Wishlist</h1>
        <p className="text-xs text-muted mt-1">Cards you want — get notified when prices drop.</p>
      </header>

      {!items && (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}

      {items && items.length === 0 && (
        <Empty>
          Your wishlist is empty.{" "}
          <Link href="/sets" className="text-accent font-semibold">
            Browse sets
          </Link>{" "}
          and tap the heart icon to add cards.
        </Empty>
      )}

      {items && items.length > 0 && (
        <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
          {items.map((item) => (
            <li key={item.id} className={`flex items-center gap-3 p-3 ${item.belowTarget ? "bg-up/[0.06]" : ""}`}>
              <Link href={`/cards/${encodeURIComponent(item.card.id)}`} className="flex items-center gap-3 flex-1 min-w-0">
                <CardImage id={item.card.id} className="w-10 rounded-md" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {item.belowTarget && <span className="mr-1 text-up">●</span>}
                    {item.card.name}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {item.card.setName} {item.card.cardNumber && `#${item.card.cardNumber}`}
                  </div>
                </div>
              </Link>
              <div className="text-right shrink-0">
                <div className="font-semibold text-sm">
                  {item.currentPrice != null ? <Money amount={item.currentPrice} currency={item.currentCurrency ?? "USD"} /> : "—"}
                </div>
                {item.targetPrice != null && (
                  <div className="text-[10px] text-muted">
                    target: <Money amount={item.targetPrice} currency={item.targetCurrency ?? "USD"} />
                  </div>
                )}
              </div>
              <button onClick={() => remove(item.card.id)} className="text-xs text-muted hover:text-down shrink-0" aria-label="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
