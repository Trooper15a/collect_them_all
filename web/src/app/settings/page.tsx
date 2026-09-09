"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Skeleton, inputCls } from "@/components/ui";
import { OfflineStatus } from "@/components/OfflineStatus";
import { showToast } from "@/components/Toast";
import { UserMenu } from "@/components/UserMenu";
import { CURRENCIES } from "@/lib/types";
import { setHidePrices, useHidePrices } from "@/lib/ui-prefs";

interface Settings {
  currency: string;
  theme: "dark" | "light";
  language: string;
  bulkCondition: string;
  bulkCurrency: string;
  pokewalletConfigured: boolean;
  pokewalletBudget: { hour: number; day: number };
  fxDate: string;
}

type Appearance = "midnight" | "black" | "light";

const APPEARANCES: { id: Appearance; label: string; hint: string; swatch: string }[] = [
  { id: "black", label: "Pure Black", hint: "True black, OLED", swatch: "#000000" },
  { id: "midnight", label: "Midnight", hint: "Dark, navy tint", swatch: "#0a0e1a" },
  { id: "light", label: "Light", hint: "Light background", swatch: "#f0f2f7" },
];

/** Sets/removes data-theme and data-bg coherently and persists both keys. */
function applyAppearance(a: Appearance) {
  const el = document.documentElement;
  try {
    if (a === "light") {
      el.setAttribute("data-theme", "light");
      el.removeAttribute("data-bg");
      localStorage.setItem("theme", "light");
      localStorage.removeItem("bgColor");
    } else {
      el.removeAttribute("data-theme");
      el.setAttribute("data-bg", a === "midnight" ? "midnight" : "black");
      localStorage.setItem("theme", "dark");
      localStorage.setItem("bgColor", a === "midnight" ? "midnight" : "black");
    }
  } catch {}
}

function readAppearance(): Appearance {
  try {
    if (localStorage.getItem("theme") === "light") return "light";
    const bg = localStorage.getItem("bgColor");
    if (bg === "midnight" || bg === "blue") return "midnight";
  } catch {}
  return "black";
}

/** Every settings section is its own box with the heading inside. */
function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-surface rounded-3xl p-5">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then(setS)
      .catch(() => setLoadError("Couldn't load settings. Check your connection and try again."));
  }, []);

  async function patch(p: Partial<Settings>) {
    const prev = s;
    try {
      const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      if (!r.ok) throw new Error("Failed");
      const d = await r.json();
      setS(d);
      showToast("Saved ✓", "up");
    } catch {
      if (prev) setS(prev);
      showToast("Save failed — try again", "down");
    }
  }

  const [appearance, setAppearance] = useState<Appearance>("black");

  useEffect(() => {
    // start "midnight" so SSR/CSR markup matches; sync from localStorage after mount
    const sync = () => {
      const cur = readAppearance();
      setAppearance(cur);
      applyAppearance(cur); // sanitize any stale incompatible attribute/key combo
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  async function selectAppearance(a: Appearance) {
    const prev = appearance;
    setAppearance(a);
    applyAppearance(a);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: a === "light" ? "light" : "dark" }),
      });
      if (!r.ok) throw new Error("Failed");
      const d = await r.json();
      setS(d);
      showToast("Saved ✓", "up");
    } catch {
      setAppearance(prev);
      applyAppearance(prev);
      showToast("Save failed — try again", "down");
    }
  }

  async function refreshNow() {
    setBusy(true);
    setRefreshMsg(null);
    try {
      const r = await fetch("/api/prices/refresh", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRefreshMsg(`Refreshed ${d.refreshed} cards (${d.failed} failed, ${d.skipped} skipped for rate limit). PokéWallet budget: ${d.pokewalletBudget.hour}/hr, ${d.pokewalletBudget.day}/day left.`);
      showToast("Prices refreshed ✓", "up");
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : "Failed");
      showToast("Refresh failed — try again", "down");
    } finally {
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <div className="pt-4">
        <div className="card-surface rounded-2xl p-4 text-sm text-down">{loadError}</div>
      </div>
    );

  if (!s)
    return (
      <div className="pt-4 space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );

  return (
    <div>
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold uppercase tracking-wider">Settings</h1>
      </header>

      <div className="space-y-4">
        <Box title="Display">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Display currency">
              <select className={inputCls} value={s.currency} onChange={(e) => patch({ currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="Appearance">
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {APPEARANCES.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => selectAppearance(opt.id)}
                      aria-pressed={appearance === opt.id}
                      className={`rounded-xl border-2 p-2 text-left transition-all ${appearance === opt.id ? "border-rainbow shadow-lg shadow-[#a78bfa]/20" : "border-line hover:border-muted"}`}
                    >
                      <span className="block h-8 rounded-lg border border-line" style={{ background: opt.swatch }} />
                      <span className="mt-1.5 block text-xs font-semibold">{opt.label}</span>
                      <span className="block text-[10px] text-muted">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="col-span-2">
              <HidePricesToggle />
            </div>
            <div className="col-span-2 text-xs text-muted">FX rates from the European Central Bank as of {s.fxDate}. Japanese cards (CardMarket EUR) convert at this rate.</div>
          </div>
        </Box>

        <Box title="Bulk scan defaults">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Condition">
              <select className={inputCls} value={s.bulkCondition} onChange={(e) => patch({ bulkCondition: e.target.value } as Partial<Settings>)}>
                <option value="NM">Near Mint</option>
                <option value="LP">Lightly Played</option>
                <option value="MP">Moderately Played</option>
                <option value="HP">Heavily Played</option>
                <option value="DMG">Damaged</option>
              </select>
            </Field>
            <Field label="Currency">
              <select className={inputCls} value={s.bulkCurrency} onChange={(e) => patch({ bulkCurrency: e.target.value } as Partial<Settings>)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <div className="col-span-2 text-xs text-muted">Used when you tap &quot;Add All&quot; in bulk scan mode. Quantity defaults to 1.</div>
          </div>
        </Box>

        <Box title="Prices">
          <div className="space-y-3">
            <div className="text-sm text-muted">Owned cards refresh automatically every night at 03:30. Run it now if you just added cards.</div>
            <Button onClick={refreshNow} disabled={busy}>
              {busy ? "Refreshing…" : "Refresh prices now"}
            </Button>
            {refreshMsg && <div className="text-xs text-muted">{refreshMsg}</div>}
          </div>
        </Box>

        <Box title="TCGPlayer price database">
          <TcgcsvPanel />
        </Box>

        <Box title="Import from CSV">
          <ImportPanel />
        </Box>

        <Box title="Export">
          <div className="space-y-3">
            <div className="text-sm text-muted">Download your whole collection as CSV: name, set, language, condition, grade, cost basis, current value (USD + EUR), gain/loss, date added.</div>
            <a href={`/api/export?currency=${s.currency}`} className="btn-rainbow inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold">
              Download CSV
            </a>
          </div>
        </Box>

        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">Offline mode</h2>
          <OfflineStatus />
        </section>

        <Box title="Account">
          <UserMenu />
        </Box>
      </div>
    </div>
  );
}


function HidePricesToggle() {
  const hidden = useHidePrices();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-elev border border-line px-3 py-2.5">
      <div>
        <div className="text-sm font-semibold">Hide prices</div>
        <div className="text-xs text-muted">Show your binders at events without flashing values — amounts display as •••. Stored on this device only.</div>
      </div>
      <button
        role="switch"
        aria-checked={hidden}
        aria-label="Hide prices"
        onClick={() => {
          setHidePrices(!hidden);
          showToast(hidden ? "Prices visible" : "Prices hidden ✓", hidden ? "down" : "up");
        }}
        className={`relative shrink-0 h-7 w-12 rounded-full border transition-colors ${hidden ? "toggle-rainbow" : "bg-elev border-line"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-fg transition-all ${hidden ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

interface TcgcsvStatus {
  running: boolean;
  progress?: { category: number; group: number; of: number };
  last?: { products: number; priced: number; historyRows: number; groups: number; errors: string[]; finishedAt: string; categories: number[] };
}

function TcgcsvPanel() {
  const [status, setStatus] = useState<TcgcsvStatus | null>(null);
  const [cats, setCats] = useState<{ id: number; label: string }[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    fetch("/api/tcgcsv")
      .then((r) => r.json())
      .then((d) => {
        setStatus(d.status);
        setCats(d.categories ?? []);
        setSelected((cur) => (cur.length ? cur : (d.defaults ?? [])));
      })
      .catch(() => undefined);

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [status?.running]);

  async function start() {
    setMsg(null);
    const r = await fetch("/api/tcgcsv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categories: selected }) });
    const d = await r.json();
    if (!r.ok) setMsg(d.error ?? "Failed");
    load();
  }

  const last = status?.last;
  return (
    <div className="space-y-3 text-sm">
      <div className="text-muted">
        Daily TCGPlayer prices for every card and sealed product, from tcgcsv.com (free, no key). Imported automatically every night; run it now for the first time.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cats.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button key={c.id} onClick={() => setSelected(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])} className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${on ? "chip-rainbow" : "border-line text-muted hover:border-muted"}`}>
              {c.label}
            </button>
          );
        })}
      </div>
      <Button onClick={start} disabled={!status || status.running || selected.length === 0}>
        {status?.running ? `Importing… category ${status.progress?.category} set ${status.progress?.group}/${status.progress?.of}` : "Import prices now"}
      </Button>
      {msg && <div className="text-xs text-down">{msg}</div>}
      {last && !status?.running && (
        <div className="text-xs text-muted">
          Last import {new Date(last.finishedAt).toLocaleString()}: {last.products.toLocaleString()} products in {last.groups} sets, {last.priced.toLocaleString()} priced, {last.historyRows.toLocaleString()} history points
          {last.errors.length > 0 && `, ${last.errors.length} errors`}.
        </div>
      )}
    </div>
  );
}


interface ImportRowView {
  line: number;
  name: string;
  number: string | null;
  set: string | null;
  quantity: number;
  status: "matched" | "ambiguous" | "unmatched" | "error";
  error?: string;
  match: { id: string; name: string; setName: string | null; cardNumber: string | null; language: string; price: number | null; currency: string | null } | null;
}

function ImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRowView[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; matched: number; ambiguous: number; unmatched: number; errors: number } | null>(null);
  const [portfolio, setPortfolio] = useState("Imported");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function preview(file: File) {
    setBusy(true);
    setMsg(null);
    setRows(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Import failed");
      setRows(d.rows);
      setSummary(d.summary);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!rows) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/import", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: rows.filter((x) => x.match), defaultPortfolio: portfolio }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Import failed");
      setMsg(`Added ${d.added} cards. ${d.skipped.length ? `Skipped lines: ${d.skipped.join(", ")}` : ""}`);
      setRows(null);
      setSummary(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="text-muted">
        Bulk-load a spreadsheet. Columns are matched by name: <span className="font-mono text-fg">name</span> (required), <span className="font-mono text-fg">number</span>, <span className="font-mono text-fg">set</span>,{" "}
        <span className="font-mono text-fg">language</span> (EN/JP), <span className="font-mono text-fg">quantity</span>, <span className="font-mono text-fg">condition</span>, <span className="font-mono text-fg">cost</span>,{" "}
        <span className="font-mono text-fg">currency</span>, <span className="font-mono text-fg">portfolio</span>, <span className="font-mono text-fg">notes</span>. The app&apos;s own CSV export re-imports as-is.
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={fileRef} type="file" accept=".csv,text/csv,.tsv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && preview(e.target.files[0])} />
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy && !rows ? "Reading…" : "Choose CSV file"}
        </Button>
        {rows && (
          <>
            <input className={`${inputCls} w-44`} value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="Default portfolio" />
            <Button onClick={commit} disabled={busy || !summary || summary.matched + summary.ambiguous === 0}>
              Import {summary ? summary.matched + summary.ambiguous : 0} cards
            </Button>
          </>
        )}
      </div>
      {summary && (
        <div className="text-xs text-muted">
          {summary.total} rows: <span className="text-up">{summary.matched} matched</span>, {summary.ambiguous} ambiguous (best guess used), <span className="text-down">{summary.unmatched} unmatched</span>
          {summary.errors > 0 && `, ${summary.errors} errors`}. Unmatched rows are skipped; add a number or set column to improve matching.
        </div>
      )}
      {rows && (
        <div className="max-h-72 overflow-auto rounded-xl border border-line">
          <table className="w-full text-xs">
            <thead className="text-muted text-left sticky top-0 bg-elev">
              <tr>
                <th className="p-2">Line</th>
                <th className="p-2">Your row</th>
                <th className="p-2">Matched card</th>
                <th className="p-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className={`border-t border-line ${r.status === "unmatched" || r.status === "error" ? "text-down" : r.status === "ambiguous" ? "text-accent" : ""}`}>
                  <td className="p-2 tabular">{r.line}</td>
                  <td className="p-2">
                    {r.name} {r.number && `#${r.number}`} {r.set && `· ${r.set}`}
                    {r.error && ` (${r.error})`}
                  </td>
                  <td className="p-2">{r.match ? `${r.match.name} · ${r.match.setName ?? ""} #${r.match.cardNumber ?? ""} (${r.match.language.toUpperCase()})` : "—"}</td>
                  <td className="p-2 text-right tabular">{r.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <div className="text-xs">{msg}</div>}
    </div>
  );
}
