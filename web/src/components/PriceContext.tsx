"use client";

import { useState } from "react";
import { type CardPrices } from "@/lib/types";

type Market = "tcgplayer" | "cardmarket";

export function PriceContext({ prices, market, variant, compact = false, amount }: {
  prices: CardPrices | null | undefined;
  market: Market;
  variant: string;
  compact?: boolean;
  amount?: number;
}) {
  const [now] = useState(() => Date.now());
  const quote = prices?.[market];
  const updated = quote?.updatedAt ? Date.parse(quote.updatedAt) : NaN;
  const ageDays = Number.isFinite(updated) ? Math.max(0, (now - updated) / 86400000) : null;
  const stale = ageDays !== null && ageDays > 30;
  const highQuote = amount !== undefined && amount >= 10000;
  const source = market === "tcgplayer" ? "TCGplayer" : "Cardmarket";
  const date = ageDays !== null
    ? new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(updated)
    : "Update date unavailable";

  return (
    <div className={`text-xs ${stale ? "text-down" : "text-muted"}`}>
      <span>{source} · {quote?.currency ?? "Currency unavailable"} · {date}</span>
      {stale && <span className="font-semibold"> · Stale price</span>}
      {highQuote && <span className="block font-semibold text-down">High quote — verify the exact card and variant.</span>}
      {!compact && (
        <span className="block mt-1">Quote for {variant}; actual value depends on condition and grading.</span>
      )}
    </div>
  );
}
