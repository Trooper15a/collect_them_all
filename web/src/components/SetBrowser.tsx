"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SetLogo } from "./SetLogo";
import { Empty, Segmented, Skeleton, inputCls } from "./ui";
import { langLabel } from "@/lib/format";
import { TCGS } from "@/lib/types";
import { useActiveTcgHydrated } from "@/lib/ui-prefs";

interface SetRow {
  id: string; tcg: string; code: string; name: string; language: string;
  total: number | null; owned: number; catalogComplete: boolean;
}

export function SetBrowser({ ownedOnly = false, binderId }: { ownedOnly?: boolean; binderId?: number }) {
  const { tcg, hydrated } = useActiveTcgHydrated();
  const [lang, setLang] = useState<"all" | "eng" | "jap">("all");
  const [query, setQuery] = useState("");
  const [onlyOwned, setOnlyOwned] = useState(ownedOnly);
  const [result, setResult] = useState<{ key: string; sets: SetRow[] } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = `${tcg}/${lang}/${binderId ?? "all"}/${retry}`;
  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ tcg, lang });
    if (binderId != null) params.set("binderId", String(binderId));
    fetch(`/api/sets?${params}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load sets");
      if (!controller.signal.aborted) setResult({ key, sets: body.sets ?? [] });
    }).catch((e) => { if (!controller.signal.aborted) setError({ key, message: e.message }); });
    return () => controller.abort();
  }, [tcg, lang, binderId, hydrated, key]);
  const sets = result?.key === key ? result.sets : null;
  const message = error?.key === key ? error.message : null;
  const q = query.trim().toLowerCase();
  const list = sets?.filter((set) => (!(ownedOnly || onlyOwned) || set.owned > 0) && (!q || `${set.name} ${set.code}`.toLowerCase().includes(q)));
  return <div>
    <input aria-label="Filter sets by name or code" className={inputCls} placeholder="Filter sets by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
    <div className="mt-3 flex flex-wrap gap-3 items-center">
      <span className="text-xs text-muted">{tcg === "all" ? "All games" : TCGS.find((t) => t.id === tcg)?.label ?? tcg}</span>
      <Segmented value={lang} onChange={setLang} size="xs" options={[{ value: "all", label: "EN + JP" }, { value: "eng", label: "EN" }, { value: "jap", label: "JP" }]} />
      {!ownedOnly && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} />Owned only</label>}
    </div>
    {message ? <Empty>{message}<button className="block mx-auto mt-3 text-accent" onClick={() => setRetry((n) => n + 1)}>Retry</button></Empty> : !sets ? <Skeleton className="mt-4 h-32" /> : !list?.length ? <div className="mt-4"><Empty>{q ? "No sets match this name." : ownedOnly || onlyOwned ? "No owned sets match these filters. Add cards or choose another binder or game." : "No sets match these filters."}</Empty></div> : <ul className="mt-4 space-y-2">
      {list.map((set) => <li key={set.id}>
        <Link href={`/sets/${encodeURIComponent(set.id)}${ownedOnly || binderId != null ? `?view=my-sets${binderId != null ? `&binderId=${binderId}` : ""}` : ""}`} className="card-surface rounded-2xl flex items-center gap-3 p-3 hover:bg-white/[0.03]">
          <SetLogo id={set.id} code={set.code} tcg={set.tcg} />
          <div className="flex-1 min-w-0"><div className="font-medium truncate">{set.name}</div><div className="text-xs text-muted">{set.code.toUpperCase()} · {langLabel(set.language)}</div></div>
          <div className="text-right text-xs shrink-0"><div className={set.owned ? "text-up font-semibold" : "text-muted"}>{set.owned} / {set.total ?? "?"} owned</div><div className="text-muted">{set.catalogComplete ? "cards" : "imported cards"}</div></div>
        </Link>
      </li>)}
    </ul>}
  </div>;
}
