"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AddToPortfolioSheet, type AddedPortfolioItem } from "@/components/AddToPortfolioSheet";
import { CardDiscovery, type DiscoveryCard } from "@/components/CardDiscovery";
import { Button, CardImage, Money } from "@/components/ui";
import { bestPrice, TCGS } from "@/lib/types";
import { setActiveTcg, type ActiveTcg } from "@/lib/ui-prefs";

type WizardState =
  | { step: "game"; tcg: ActiveTcg }
  | { step: "card"; tcg: ActiveTcg; adding: DiscoveryCard | null }
  | { step: "success"; added: AddedPortfolioItem };

const stepNumber = { game: 1, card: 2, success: 3 } as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ step: "game", tcg: "pokemon" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [state.step]);

  async function skip() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "dismissed" }),
      });
      if (!response.ok) throw new Error("Could not save your choice. Please try again.");
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your choice. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function continueToCards() {
    if (state.step !== "game") return;
    setActiveTcg(state.tcg);
    setError(null);
    setState({ step: "card", tcg: state.tcg, adding: null });
  }

  async function added(result: AddedPortfolioItem) {
    try {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "completed" }),
      });
    } finally {
      setState({ step: "success", added: result });
    }
  }

  const current = stepNumber[state.step];

  return (
    <div className="min-h-[calc(100dvh-2rem)] py-4 sm:py-8">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/landing" className="text-lg font-black tracking-tight">RipnPull</Link>
          {state.step !== "success" && (
            <button type="button" onClick={() => void skip()} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg disabled:opacity-50">
              {busy ? "Saving…" : "Skip for now"}
            </button>
          )}
        </header>

        <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Introduction progress">
          {["Game", "First card", "Ready"].map((label, index) => {
            const number = index + 1;
            return (
              <li key={label} aria-current={number === current ? "step" : undefined} className="flex items-center gap-2 text-xs text-muted">
                <span className={`grid h-7 w-7 place-items-center rounded-full border ${number <= current ? "border-accent bg-accent/15 text-fg" : "border-line"}`}>{number}</span>
                <span className="hidden sm:inline">{label}</span>
              </li>
            );
          })}
        </ol>

        {error && <p className="mb-4 rounded-xl border border-down/30 bg-down/10 p-3 text-sm text-down" role="alert">{error}</p>}

        {state.step === "game" && (
          <section className="anim-widget d1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">Let’s make this yours</p>
            <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">Choose your game</h1>
            <p className="mt-2 text-muted">We’ll tune search and scanning to the cards you collect. Pokémon is selected to get you moving.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {TCGS.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  aria-pressed={state.tcg === game.id}
                  onClick={() => setState({ step: "game", tcg: game.id })}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${state.tcg === game.id ? "border-accent bg-accent/10" : "border-line bg-card hover:border-white/20"}`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: game.accent }} aria-hidden />
                  <span className="font-semibold">{game.label}</span>
                </button>
              ))}
              <button type="button" aria-pressed={state.tcg === "all"} onClick={() => setState({ step: "game", tcg: "all" })} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${state.tcg === "all" ? "border-accent bg-accent/10" : "border-line bg-card hover:border-white/20"}`}>
                <span className="h-3 w-3 rounded-full bg-white" aria-hidden />
                <span className="font-semibold">All games</span>
              </button>
            </div>
            <Button className="mt-6 w-full" onClick={continueToCards}>Continue</Button>
          </section>
        )}

        {state.step === "card" && (
          <section className="anim-widget d1">
            <button type="button" onClick={() => setState({ step: "game", tcg: state.tcg })} className="mb-4 text-sm text-muted hover:text-fg">← Back</button>
            <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">Add your first card</h1>
            <p className="mb-6 mt-2 text-muted">Search by name or scan a card. You can choose its binder, condition, and variant before saving.</p>
            <CardDiscovery initialTcg={state.tcg} compact allowCamera onSelect={(card) => setState({ ...state, adding: card })} />
            <AddToPortfolioSheet card={state.adding} onClose={() => setState({ ...state, adding: null })} onAdded={(result) => void added(result)} />
          </section>
        )}

        {state.step === "success" && (
          <section className="anim-widget d1 text-center">
            <div className="mx-auto mb-5 w-36 overflow-hidden rounded-2xl shadow-2xl"><CardImage id={state.added.card.id} className="w-full" alt={state.added.card.name} /></div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-up">First card added</p>
            <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">Your collection has started</h1>
            <p className="mt-3 text-muted"><span className="font-semibold text-fg">{state.added.card.name}</span> is now in {state.added.portfolioName}.</p>
            {bestPrice(state.added.card.prices) && (
              <p className="mt-2 text-sm text-muted">Current market: <span className="font-semibold text-fg"><Money amount={bestPrice(state.added.card.prices)?.amount} currency={bestPrice(state.added.card.prices)?.currency} /></span></p>
            )}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link href={`/portfolios/${state.added.portfolioId}`} className="btn-rainbow rounded-xl px-5 py-3 font-semibold">View my binder</Link>
              <Link href="/scan" className="rounded-xl border border-line bg-card px-5 py-3 font-semibold">Add another card</Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}