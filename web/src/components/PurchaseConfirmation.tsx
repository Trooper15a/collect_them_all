"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui";

interface Confirmation { status: "pending" | "test_paid" | "paid"; premium: boolean; testMode: boolean }

export function PurchaseConfirmation({ sessionId }: { sessionId: string | null }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ userId: string; sessionId: string; attempt: number; data?: Confirmation; error?: string } | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId || !sessionId) return;
    const controller = new AbortController();
    fetch(`/api/stripe/status?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Couldn't verify this purchase.");
        if (!["pending", "test_paid", "paid"].includes(body.status)) throw new Error("Couldn't verify this purchase.");
        if (!controller.signal.aborted) setResult({ userId, sessionId, attempt, data: body });
      })
      .catch(error => { if (!controller.signal.aborted) setResult({ userId, sessionId, attempt, error: error.message }); });
    return () => controller.abort();
  }, [attempt, sessionId, status, userId]);

  const scoped = result?.userId === userId && result.sessionId === sessionId && result.attempt === attempt ? result : null;
  const data = scoped?.data;
  const callback = `/premium/success?session_id=${encodeURIComponent(sessionId ?? "")}`;
  return (
    <section className="card-surface rounded-2xl border border-line p-5 space-y-4" aria-label="Purchase confirmation">
      {!sessionId ? <><h1 className="text-xl font-medium">No purchase reference found</h1><p className="text-sm text-muted">Return to Premium to start or check your purchase.</p></>
        : status === "unauthenticated" ? <><h1 className="text-xl font-medium">Sign in to check your purchase</h1><Link href={`/login?callbackUrl=${encodeURIComponent(callback)}`} className="text-sm text-accent underline">Sign in</Link></>
        : !scoped ? <p role="status" className="text-sm text-muted">Verifying your purchase…</p>
        : scoped.error ? <><h1 className="text-xl font-medium">Purchase could not be verified</h1><p role="alert" className="text-sm text-muted">{scoped.error}</p><Button variant="ghost" onClick={() => setAttempt(value => value + 1)}>Try again</Button></>
        : data?.status === "pending" ? <><h1 className="text-xl font-medium">Payment not confirmed yet</h1><p className="text-sm text-muted">Stripe is still waiting for this payment to finish. You can check again shortly.</p><Button variant="ghost" onClick={() => setAttempt(value => value + 1)}>Check again</Button></>
        : data?.status === "test_paid" && data.testMode ? <><h1 className="text-xl font-medium">Test purchase confirmed</h1><p className="text-sm text-muted">No real payment was made. This sandbox test does not activate paid access on the live app.</p></>
        : data?.status === "paid" && data.premium && !data.testMode ? <><h1 className="text-xl font-medium">Premium is active</h1><p className="text-sm text-muted">Your one-time purchase has been verified for this account.</p></>
        : <p role="alert" className="text-sm text-muted">Purchase could not be verified.</p>}
      <Link href="/" className="inline-block text-sm text-accent underline">Back to your collection</Link>
    </section>
  );
}
