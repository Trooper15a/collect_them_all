"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { milestoneView, type MilestoneState } from "@/lib/onboarding";

export function FirstBinderMilestone({ itemCount }: { itemCount: number }) {
  const router = useRouter();
  const [state, setState] = useState<MilestoneState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/onboarding", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Failed")))
      .then((status) => { if (active) setState(status.milestoneState); })
      .catch(() => { if (active) setState("dismissed"); });
    return () => { active = false; };
  }, []);

  async function patch(milestoneState: MilestoneState) {
    const response = await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ milestoneState }),
    });
    if (!response.ok) throw new Error("Could not save milestone state");
    setState(milestoneState);
  }

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    try { await patch("dismissed"); } finally { setBusy(false); }
  }

  async function openSets() {
    if (busy) return;
    setBusy(true);
    try {
      await patch("opened");
      router.push("/sets");
    } catch {
      setBusy(false);
    }
  }

  if (!state) return null;
  const view = milestoneView(itemCount, state);
  if (!view) return null;

  return (
    <section className="card-surface relative mt-3 rounded-3xl p-5 anim-widget d3" aria-label="First binder progress">
      <button type="button" onClick={() => void dismiss()} disabled={busy} aria-label="Dismiss first binder progress" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-fg disabled:opacity-50">×</button>
      {view === "progress" ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Build your first binder</p>
          <h2 className="mt-1 pr-8 text-lg font-bold">{itemCount} of 5 cards</h2>
          <div className="mt-4 grid grid-cols-5 gap-2" aria-label={`${itemCount} of 5 cards added`}>
            {Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-2 rounded-full ${index < itemCount ? "bg-accent" : "bg-white/10"}`} />)}
          </div>
          <button type="button" onClick={() => router.push("/scan")} className="mt-4 text-sm font-semibold text-accent">Add another card →</button>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-up">Five-card milestone</p>
          <h2 className="mt-1 pr-8 text-xl font-bold">Your binder is taking shape</h2>
          <p className="mt-2 text-sm text-muted">Explore full sets and see how close you are to completing one.</p>
          <button type="button" onClick={() => void openSets()} disabled={busy} className="btn-rainbow mt-4 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">Explore Sets</button>
        </>
      )}
    </section>
  );
}