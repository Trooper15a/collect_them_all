"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui";

interface Availability { premium: boolean; configured: boolean; paymentsEnabled: boolean; testMode: boolean }

export function PremiumPurchase() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ userId: string; attempt: number; data?: Availability; error?: string } | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<{ userId: string; message: string } | null>(null);
  const requestKey = useRef<{ userId: string; key: string } | null>(null);
  const checkoutRequest = useRef<{ userId: string; controller: AbortController } | null>(null);

  useEffect(() => {
    return () => {
      if (checkoutRequest.current?.userId === userId) {
        checkoutRequest.current.controller.abort();
        checkoutRequest.current = null;
      }
      if (requestKey.current?.userId === userId) requestKey.current = null;
      setBusyUser(current => current === userId ? null : current);
    };
  }, [userId]);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const controller = new AbortController();
    fetch("/api/stripe/status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Couldn't check purchase availability.");
        if (typeof body.paymentsEnabled !== "boolean" || typeof body.premium !== "boolean") throw new Error("Couldn't check purchase availability.");
        if (!controller.signal.aborted) setResult({ userId, attempt, data: body });
      })
      .catch(error => { if (!controller.signal.aborted) setResult({ userId, attempt, error: error.message }); });
    return () => controller.abort();
  }, [attempt, status, userId]);

  const scoped = result?.userId === userId && result.attempt === attempt ? result : null;
  const busy = busyUser === userId && userId !== null;

  async function checkout() {
    if (!userId || checkoutRequest.current?.userId === userId) return;
    checkoutRequest.current?.controller.abort();
    const controller = new AbortController();
    checkoutRequest.current = { userId, controller };
    if (!requestKey.current || requestKey.current.userId !== userId) requestKey.current = { userId, key: crypto.randomUUID() };
    setBusyUser(userId);
    setCheckoutError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Idempotency-Key": requestKey.current.key }, signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't start checkout. Please try again.");
      const url = new URL(body.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Checkout returned an invalid link. Please try again.");
      if (!controller.signal.aborted) window.location.assign(url.href);
    } catch (error) {
      if (!controller.signal.aborted) setCheckoutError({ userId, message: error instanceof Error ? error.message : "Couldn't start checkout. Please try again." });
    } finally {
      if (checkoutRequest.current?.controller === controller) { checkoutRequest.current = null; setBusyUser(null); }
    }
  }

  return (
    <section className="card-surface rounded-2xl border border-line p-5 space-y-5" aria-label="Premium purchase">
      <div>
        <p className="text-3xl font-medium tracking-tight">US$4.99</p>
        <p className="mt-1 text-sm text-muted">One payment. No recurring charges.</p>
      </div>
      {status === "loading" ? <p role="status" className="text-sm text-muted">Checking your account…</p>
        : status === "unauthenticated" ? <Link className="btn-rainbow inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold" href="/login?callbackUrl=%2Fpricing">Sign in to continue</Link>
        : !scoped ? <p role="status" className="text-sm text-muted">Checking purchase availability…</p>
        : scoped.error ? <div role="alert" className="space-y-3"><p className="text-sm text-muted">{scoped.error}</p><Button variant="ghost" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
        : scoped.data?.premium && !scoped.data.testMode ? <p className="text-sm text-up">You already have Premium.</p>
        : !scoped.data?.paymentsEnabled ? <p className="text-sm text-muted">Purchases are not available yet. RipnPull remains free during beta.</p>
        : <>
          {scoped.data.testMode && <p className="rounded-xl border border-line bg-elev p-3 text-sm text-muted">Sandbox checkout. Use test payment details; no real payment will be made.</p>}
          <Button onClick={checkout} disabled={busy} className="w-full min-h-11">{busy ? "Opening checkout…" : scoped.data.testMode ? "Open test checkout" : "Continue to checkout"}</Button>
          {checkoutError?.userId === userId && <p role="alert" className="text-sm text-down">{checkoutError.message}</p>}
        </>}
      <p className="text-xs text-muted">Secure checkout hosted by Stripe. Your purchase is linked to your RipnPull account.</p>
    </section>
  );
}
