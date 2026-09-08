"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Section } from "@/components/ui";

interface Match {
  id: string;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  language: string;
  price: number | null;
  currency: string | null;
}

interface ImportRow {
  line: number;
  raw: Record<string, string>;
  name: string;
  number: string | null;
  set: string | null;
  quantity: number;
  condition: string;
  cost: number | null;
  currency: string;
  portfolio: string | null;
  variant: string | null;
  notes: string | null;
  cardId: string | null;
  match: Match | null;
  candidates: number;
  status: "matched" | "ambiguous" | "unmatched" | "error";
  error?: string;
}

interface Summary {
  total: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  errors: number;
}

type Step = "upload" | "preview" | "done";

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [portfolio, setPortfolio] = useState("Imported");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setRows(data.rows);
      setSummary(data.summary);
      setStep("preview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const commit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, defaultPortfolio: portfolio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [rows, portfolio]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [upload]);

  return (
    <div className="py-6 space-y-6">
      <h1 className="text-2xl font-bold">Import Collection</h1>
      <p className="text-sm text-muted">
        Import cards from Collectr, TCGPlayer, or any CSV/TSV file. We auto-detect columns like name, set, number, quantity, condition, and cost.
      </p>

      {error && (
        <div className="rounded-xl bg-down/10 border border-down/30 p-3 text-sm text-down">{error}</div>
      )}

      {step === "upload" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="rounded-2xl border-2 border-dashed border-line hover:border-accent/40 transition-colors p-10 text-center"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
          />
          <div className="text-4xl mb-3 opacity-40">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="text-sm text-muted mb-4">Drag & drop your CSV file here, or</p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="btn-rainbow rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Processing..." : "Choose file"}
          </button>
          <p className="text-xs text-muted mt-4">Supports CSV, TSV. Max 5 MB / 5,000 rows.</p>
        </div>
      )}

      {step === "preview" && summary && (
        <>
          <Section title="Preview">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat label="Total rows" value={summary.total} />
              <Stat label="Matched" value={summary.matched} color="text-up" />
              <Stat label="Ambiguous" value={summary.ambiguous} color="text-yellow-400" />
              <Stat label="Unmatched" value={summary.unmatched} color="text-down" />
            </div>

            <label className="block text-sm mb-4">
              <span className="text-muted">Portfolio name</span>
              <input
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/[0.04] border border-line px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </label>

            <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-elev border-b border-line">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted">Line</th>
                    <th className="text-left px-3 py-2 font-medium text-muted">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-muted">Match</th>
                    <th className="text-left px-3 py-2 font-medium text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-line/50">
                      <td className="px-3 py-1.5 text-muted">{r.line}</td>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5 text-muted truncate max-w-[160px]">
                        {r.match ? `${r.match.name} (${r.match.setName ?? "?"} #${r.match.cardNumber ?? "?"})` : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep("upload"); setRows([]); setSummary(null); }}
              className="flex-1 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-white/[0.04] transition-colors"
            >
              Start over
            </button>
            <button
              onClick={commit}
              disabled={loading || summary.matched + summary.ambiguous === 0}
              className="btn-rainbow flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Importing..." : `Import ${summary.matched + summary.ambiguous} cards`}
            </button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <div className="rounded-2xl bg-elev border border-line p-6 text-center space-y-4">
          <div className="text-4xl">
            <svg className="w-14 h-14 mx-auto text-up" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold">Import complete</h2>
          <p className="text-sm text-muted">
            {result.added} cards added to your collection.
            {result.skipped.length > 0 && ` ${result.skipped.length} rows skipped.`}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link href="/portfolios" className="btn-rainbow rounded-xl px-5 py-2.5 text-sm font-semibold">
              View binders
            </Link>
            <button
              onClick={() => { setStep("upload"); setRows([]); setSummary(null); setResult(null); }}
              className="rounded-xl border border-line px-5 py-2.5 text-sm font-medium hover:bg-white/[0.04] transition-colors"
            >
              Import another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-elev border border-line p-3 text-center">
      <div className={`text-xl font-bold tabular ${color ?? ""}`}>{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    matched: { bg: "bg-up/10", text: "text-up", label: "Matched" },
    ambiguous: { bg: "bg-yellow-400/10", text: "text-yellow-400", label: "Ambiguous" },
    unmatched: { bg: "bg-down/10", text: "text-down", label: "Unmatched" },
    error: { bg: "bg-down/10", text: "text-down", label: "Error" },
  };
  const s = map[status] ?? map.error;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
