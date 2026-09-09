"use client";

import { useState } from "react";

const BRAND_ICONS: Record<string, { emoji: string; bg: string; fg: string }> = {
  pokemon: { emoji: "⚡", bg: "#facc15", fg: "#000" },
  mtg: { emoji: "🔮", bg: "#60a5fa", fg: "#fff" },
  yugioh: { emoji: "🌀", bg: "#c084fc", fg: "#fff" },
  onepiece: { emoji: "☠️", bg: "#f87171", fg: "#fff" },
  lorcana: { emoji: "✨", bg: "#f0abfc", fg: "#fff" },
  digimon: { emoji: "🐉", bg: "#fb923c", fg: "#fff" },
  dbs: { emoji: "🐲", bg: "#fbbf24", fg: "#000" },
  dbfw: { emoji: "🐲", bg: "#f59e0b", fg: "#000" },
  fab: { emoji: "⚔️", bg: "#ef4444", fg: "#fff" },
  swu: { emoji: "⭐", bg: "#93c5fd", fg: "#000" },
  vanguard: { emoji: "🛡️", bg: "#a78bfa", fg: "#fff" },
  weiss: { emoji: "🃏", bg: "#e5e7eb", fg: "#000" },
  finalfantasy: { emoji: "💎", bg: "#67e8f9", fg: "#000" },
  unionarena: { emoji: "🏟️", bg: "#34d399", fg: "#000" },
};

function tcgFromId(id: string): string | null {
  const m = id.match(/^([a-z]+):/);
  if (!m) return null;
  const prefix = m[1];
  if (prefix === "tp") return null;
  return prefix;
}

export function SetLogo({ id, code, tcg, className = "w-12 h-8" }: { id: string; code: string; tcg?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    const brand = tcg ?? tcgFromId(id);
    const icon = brand ? BRAND_ICONS[brand] : null;
    if (icon) {
      return (
        <div className={`${className} rounded-md flex items-center justify-center`} style={{ background: icon.bg }}>
          <span className="text-base leading-none" role="img" aria-hidden>{icon.emoji}</span>
        </div>
      );
    }
    return <div className={`${className} rounded-md bg-white/[0.05] border border-line flex items-center justify-center text-[9px] font-bold text-muted uppercase`}>{code.slice(0, 5)}</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/sets/${encodeURIComponent(id)}/image`} alt="" loading="lazy" className={`${className} object-contain`} onError={() => setFailed(true)} />;
}
