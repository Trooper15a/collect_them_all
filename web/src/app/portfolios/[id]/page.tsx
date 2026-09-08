"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackLink } from "@/components/BackLink";
import { PriceChart } from "@/components/PriceChart";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SwipeToDelete } from "@/components/SwipeToDelete";
import { showToast } from "@/components/Toast";
import { Button, CardImage, Delta, Empty, Field, Money, Segmented, Skeleton, TcgBadge, inputCls } from "@/components/ui";
import { RANGES, type Range, langLabel } from "@/lib/format";
import { CONDITIONS, type NormalizedCard, variantLabel } from "@/lib/types";

interface Item {
  id: number;
  card: NormalizedCard;
  quantity: number;
  variantType: string;
  condition: string;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  costBasis: number | null;
  costCurrency: string;
  notes: string | null;
  addedAt: string;
  unitPrice: { amount: number; currency: string; variant: string } | null;
  value: number;
  cost: number | null;
  gain: number | null;
  gainPct: number | null;
  change24hPct: number | null;
}
interface Data {
  portfolio: { id: number; name: string; tcgId: string | null; language: string | null; accentColor: string | null };
  items: Item[];
  summary: { value: number; cost: number; gain: number; gainPct: number | null; itemCount: number; change24h: number; change24hPct: number | null };
  series: { date: string; value: number }[];
  currency: string;
}

type Sort = "value" | "name" | "set" | "gain" | "added" | "lang";

/** Sealed products (booster boxes, ETBs, tins) are stored as cards with rarity "Sealed". */
function isSealedCard(card: NormalizedCard): boolean {
  return card.rarity === "Sealed" || card.meta?.sealed === true;
}

export default function PortfolioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [range, setRange] = useState<Range>("1M");
  const [data, setData] = useState<Data | null>(null);
  const [sort, setSort] = useState<Sort>("value");
  const [langFilter, setLangFilter] = useState<"all" | "eng" | "jap">("all");
  const [editing, setEditing] = useState<Item | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [accentColor, setAccentColor] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/portfolios/${id}?range=${range}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then((d: Data) => {
        if (!d || !d.portfolio) throw new Error("Couldn't load this binder. Pull to retry.");
        setData(d);
        setName(d.portfolio.name);
        setAccentColor(d.portfolio.accentColor ?? null);
      })
      .catch((e) => setError(e.message));
  }, [id, range]);
  useEffect(load, [load]);

  const items = useMemo(() => {
    if (!data) return [];
    const list = data.items.filter((i) => langFilter === "all" || i.card.language === langFilter);
    const cmp: Record<Sort, (a: Item, b: Item) => number> = {
      value: (a, b) => b.value - a.value,
      name: (a, b) => a.card.name.localeCompare(b.card.name),
      set: (a, b) => (a.card.setName ?? "").localeCompare(b.card.setName ?? "") || (a.card.cardNumber ?? "").localeCompare(b.card.cardNumber ?? "", undefined, { numeric: true }),
      gain: (a, b) => (b.gain ?? -Infinity) - (a.gain ?? -Infinity),
      added: (a, b) => b.addedAt.localeCompare(a.addedAt),
      lang: (a, b) => a.card.language.localeCompare(b.card.language),
    };
    return list.sort(cmp[sort]);
  }, [data, sort, langFilter]);

  async function rename() {
    if (renameBusy || !name.trim()) return;
    setRenameBusy(true);
    try {
      const r = await fetch(`/api/portfolios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!r.ok) {
        showToast("Rename failed — try again", "down");
        return;
      }
      setRenaming(false);
      showToast("Renamed ✓", "up");
      load();
    } catch {
      showToast("Rename failed — try again", "down");
    } finally {
      setRenameBusy(false);
    }
  }
  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      showToast("Binder deleted", "info");
      router.push("/portfolios");
    } catch {
      showToast("Delete failed — try again", "down");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function restoreItem(item: Item) {
    try {
      const r = await fetch(`/api/portfolios/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: item.card.id,
          quantity: item.quantity,
          variantType: item.variantType,
          condition: item.condition,
          isGraded: item.isGraded,
          gradingCompany: item.gradingCompany,
          grade: item.grade,
          certNumber: item.certNumber,
          costBasis: item.costBasis,
          costCurrency: item.costCurrency,
          notes: item.notes,
        }),
      });
      if (!r.ok) throw new Error("Restore failed");
      showToast("Restored ✓", "up");
    } catch {
      showToast("Undo failed — try again", "down");
    } finally {
      load();
    }
  }

  async function deleteItem(item: Item) {
    setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== item.id) } : d));
    try {
      const r = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      showToast("Deleted", "info", { action: { label: "Undo", onClick: () => restoreItem(item) }, durationMs: 6000 });
    } catch {
      showToast("Delete failed — try again", "down");
    } finally {
      load();
    }
  }

  if (error) return <Empty>{error}</Empty>;
  if (!data)
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-16" />
      </div>
    );
  const c = data.currency;
  const s = data.summary;

  return (
    <PullToRefresh onRefresh={load}>
    <div>
      <header className="pt-2 pb-3 flex items-center gap-3">
        <BackLink fallback="/portfolios" label="Binders" />
        {renaming ? (
          <div className="flex-1 flex gap-2">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") rename();
                else if (e.key === "Escape") setRenaming(false);
              }}
              disabled={renameBusy}
              autoFocus
            />
            <Button className="px-3" onClick={rename} disabled={renameBusy || !name.trim()}>
              {renameBusy ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <button type="button" className="text-xl font-bold flex-1 truncate text-left" onClick={() => { setName(data.portfolio.name); setRenaming(true); }}>
            {data.portfolio.name} <span className="text-muted text-sm">✎</span>
          </button>
        )}
        <button onClick={() => setConfirmingDelete(true)} className="text-xs text-down min-h-8 px-1">
          Delete
        </button>
      </header>

      {confirmingDelete && (
        <div className="card-surface rounded-2xl p-4 mb-3 border border-down/30">
          <div className="text-sm">Delete &quot;{data.portfolio.name}&quot; and all its cards? This can&apos;t be undone.</div>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={remove} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete binder"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted">Color</span>
        {["#3b82f6", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb923c", "#ef4444"].map((c) => (
          <button
            key={c}
            onClick={async () => {
              setAccentColor(c);
              const r = await fetch(`/api/portfolios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accentColor: c }) });
              if (!r.ok) {
                showToast("Save failed — try again", "down");
                load();
              }
            }}
            className="w-6 h-6 rounded-full border-2 transition-transform"
            style={{ background: c, borderColor: accentColor === c ? "white" : "transparent", transform: accentColor === c ? "scale(1.2)" : undefined }}
          />
        ))}
        {accentColor && (
          <button
            onClick={async () => {
              setAccentColor(null);
              const r = await fetch(`/api/portfolios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accentColor: null }) });
              if (!r.ok) {
                showToast("Save failed — try again", "down");
                load();
              }
            }}
            className="text-[10px] text-muted ml-1"
          >
            Reset
          </button>
        )}
      </div>

      <div className="card-surface rounded-3xl p-5 anim-widget d1" style={accentColor ? { borderColor: `${accentColor}33`, borderWidth: 1 } : undefined}>
        <div className="text-xs text-muted">Value</div>
        <div className="text-3xl font-bold tabular mt-1">
          <Money amount={s.value} currency={c} />
        </div>
        <div className="text-sm mt-1 flex flex-wrap gap-x-4">
          <span>
            <span className="text-muted">24h </span>
            <Delta amount={s.change24h} pct={s.change24hPct} currency={c} />
          </span>
          <span>
            <span className="text-muted">Gain </span>
            <Delta amount={s.cost > 0 ? s.gain : null} pct={s.gainPct} currency={c} />
          </span>
          <span className="text-muted">{s.itemCount} cards</span>
        </div>
        <div className="mt-2 -mx-2">
          <PriceChart data={data.series ?? []} currency={c} height={120} />
        </div>
        <div className="mt-2 flex justify-center">
          <Segmented value={range} onChange={setRange} size="xs" options={RANGES.map((r) => ({ value: r, label: r }))} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 justify-between">
        <select className="rounded-full bg-elev border border-line px-3 py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="value">Sort: Value</option>
          <option value="gain">Sort: Gain/Loss</option>
          <option value="name">Sort: Name</option>
          <option value="set">Sort: Set</option>
          <option value="added">Sort: Date added</option>
          <option value="lang">Sort: Language</option>
        </select>
        <Segmented
          value={langFilter}
          onChange={setLangFilter}
          size="xs"
          options={[
            { value: "all", label: "All" },
            { value: "eng", label: "EN" },
            { value: "jap", label: "JP" },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <div className="mt-4">
          <Empty>
            No cards here yet.{" "}
            <Link href="/scan" className="text-accent font-semibold">
              Scan or search
            </Link>{" "}
            to add some.
          </Empty>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 stagger-children">
          {items.map((i) => {
            const sealed = isSealedCard(i.card);
            return (
            <SwipeToDelete key={i.id} onDelete={() => deleteItem(i)}>
            <div className="card-surface rounded-2xl overflow-hidden flex flex-col tap-scale hover-lift relative">
              <Link href={`/cards/${encodeURIComponent(i.card.id)}`}>
                {sealed ? (
                  // sealed product shots aren't card-shaped — keep natural aspect
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/images/${encodeURIComponent(i.card.id)}?size=low`} alt="" loading="lazy" className="w-full aspect-square object-contain bg-elev" />
                ) : (
                  <CardImage id={i.card.id} className="w-full" alt="" />
                )}
              </Link>
              {i.quantity > 1 && <div className="absolute top-1.5 right-1.5 rounded-full bg-up text-black text-[10px] font-bold px-1.5">×{i.quantity}</div>}
              <button type="button" className="p-2.5 flex-1 flex flex-col gap-0.5 text-left" onClick={() => setEditing(i)}>
                <div className="font-medium text-sm leading-tight line-clamp-2">{i.card.name}</div>
                <div className="text-[11px] text-muted truncate">
                  {i.card.setName} {i.card.cardNumber ? `#${i.card.cardNumber}` : sealed ? "· Sealed" : ""}
                </div>
                <TcgBadge tcg={i.card.tcg} lang={i.card.language} />
                <div className="mt-auto pt-1 flex items-center justify-between">
                  <span className="font-semibold text-sm">
                    <Money amount={i.value} currency={c} />
                  </span>
                  <span className="text-[11px]">
                    <Delta pct={i.change24hPct} />
                  </span>
                </div>
              </button>
            </div>
            </SwipeToDelete>
            );
          })}
        </div>
      )}

      {editing && (
        <EditItemSheet
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onRemove={() => {
            setEditing(null);
            deleteItem(editing);
          }}
        />
      )}
    </div>
    </PullToRefresh>
  );
}

function EditItemSheet({ item, onClose, onSaved, onRemove }: { item: Item; onClose: () => void; onSaved: () => void; onRemove: () => void }) {
  const { id: currentPortfolioId } = useParams<{ id: string }>();
  const sealed = isSealedCard(item.card);
  const [quantity, setQuantity] = useState(item.quantity);
  const [condition, setCondition] = useState(item.condition);
  const [graded, setGraded] = useState(item.isGraded);
  const [company, setCompany] = useState(item.gradingCompany ?? "PSA");
  const [grade, setGrade] = useState(item.grade ?? "10");
  const [cert, setCert] = useState(item.certNumber ?? "");
  const [cost, setCost] = useState(item.costBasis?.toString() ?? "");
  const [costCurrency, setCostCurrency] = useState(item.costCurrency);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [variant, setVariant] = useState(item.variantType);
  const [busy, setBusy] = useState(false);
  const [allPortfolios, setAllPortfolios] = useState<{ id: number; name: string }[]>([]);
  const [transferTo, setTransferTo] = useState<number | null>(null);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const variants = [...new Set([...Object.keys(item.card.prices.tcgplayer?.variants ?? {}), ...Object.keys(item.card.prices.cardmarket?.variants ?? {}), item.variantType])];

  useEffect(() => {
    fetch("/api/portfolios").then((r) => r.json()).then((d) => {
      const list = (d.portfolios ?? []).map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })).filter((p: { id: number }) => p.id !== Number(currentPortfolioId));
      setAllPortfolios(list);
      if (list.length) setTransferTo(list[0].id);
    }).catch(() => undefined);
  }, [currentPortfolioId]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity,
          variantType: variant,
          condition,
          isGraded: sealed ? false : graded,
          gradingCompany: graded ? company : null,
          grade: graded ? grade : null,
          certNumber: graded ? cert || null : null,
          costBasis: cost === "" ? null : Number(cost),
          costCurrency,
          notes: notes || null,
        }),
      });
      if (!r.ok) {
        showToast("Save failed — try again", "down");
        return;
      }
      showToast("Saved ✓", "up");
      onSaved();
    } catch {
      showToast("Save failed — try again", "down");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button className="absolute inset-0 bg-black/60 anim-fade-up" style={{ animationDuration: "0.2s" }} onClick={onClose} aria-label="Close" />
      <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)] max-h-[88vh] overflow-y-auto anim-widget d1" style={{ animationName: "slide-up-sheet" }}>
        <div className="font-semibold text-lg">{item.card.name}</div>
        <div className="text-xs text-muted mb-3">
          {item.card.setName} · {langLabel(item.card.language)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <input className={inputCls} type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
          </Field>
          <Field label="Variant">
            <select className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value)}>
              {variants.map((v) => (
                <option key={v} value={v}>
                  {variantLabel(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value)} disabled={graded}>
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {!sealed && (
            <label className="flex items-end gap-2 text-sm pb-2">
              <input type="checkbox" checked={graded} onChange={(e) => setGraded(e.target.checked)} className="accent-accent w-4 h-4" /> Graded
            </label>
          )}
          {!sealed && graded && (
            <>
              <Field label="Company">
                <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} />
              </Field>
              <Field label="Grade">
                <input className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)} />
              </Field>
              <div className="col-span-2">
                <Field label="Cert number">
                  <input className={inputCls} value={cert} onChange={(e) => setCert(e.target.value)} />
                </Field>
              </div>
            </>
          )}
          <Field label={sealed ? "Cost basis (per item)" : "Cost basis (per card)"}>
            <input className={inputCls} type="number" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={costCurrency} onChange={(e) => setCostCurrency(e.target.value)}>
              {["USD", "EUR", "GBP", "CAD", "JPY", "AUD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
        {allPortfolios.length > 0 && (
          <div className="mt-4 pt-3 border-t border-line">
            <div className="text-xs text-muted mb-2">Transfer to another portfolio</div>
            <div className="flex gap-2">
              <select className={`${inputCls} flex-1`} value={transferTo ?? ""} onChange={(e) => setTransferTo(Number(e.target.value))}>
                {allPortfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button variant="ghost" disabled={!transferTo || busy} onClick={async () => {
                if (!transferTo) return;
                setBusy(true);
                setTransferMsg(null);
                const r = await fetch(`/api/items/${item.id}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toPortfolioId: transferTo }) });
                const d = await r.json();
                setBusy(false);
                if (r.ok) {
                  setTransferMsg(`Moved to ${d.movedTo}`);
                  setTimeout(onSaved, 600);
                } else {
                  setTransferMsg(d.error ?? "Transfer failed");
                }
              }}>Transfer</Button>
            </div>
            {transferMsg && <div className="text-xs text-muted mt-1">{transferMsg}</div>}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="danger" onClick={onRemove}>
            Remove
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={busy}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
