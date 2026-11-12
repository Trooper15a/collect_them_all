"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

const BYPASS = ["/landing", "/login", "/privacy", "/terms", "/faq", "/auth/error", "/onboarding", "/card-show"];

function bypassesGate(pathname: string) {
  return BYPASS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = status === "authenticated" ? session?.user?.id ?? null : null;
  const bypass = bypassesGate(pathname);
  const introduction = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const [admission, setAdmission] = useState({ userId, introduction, checked: false, failedPath: null as string | null });
  const [attempt, setAttempt] = useState(0);

  // Reset before rendering a different account or returning from the introduction.
  // Only a successful check is reusable across routes in this mounted gate.
  const sameScope = admission.userId === userId && admission.introduction === introduction;
  if (!sameScope) {
    setAdmission({ userId, introduction, checked: false, failedPath: null });
  }
  const admitted = sameScope && admission.checked;
  const failedPath = sameScope ? admission.failedPath : null;

  const retry = useCallback(() => {
    setAdmission((current) => ({ ...current, checked: false, failedPath: null }));
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (bypass || status !== "authenticated" || !userId || admitted || failedPath === pathname) return;

    let active = true;
    const controller = new AbortController();

    async function check() {
      try {
        const response = await fetch("/api/onboarding", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Onboarding check failed");
        const result = (await response.json()) as { eligible?: boolean };
        if (!active) return;
        if (result.eligible) {
          router.replace("/onboarding");
          return;
        }
        setAdmission({ userId, introduction: false, checked: true, failedPath: null });
      } catch {
        if (!active || controller.signal.aborted) return;
        setAdmission({ userId, introduction: false, checked: false, failedPath: pathname });
      }
    }

    void check();
    return () => {
      active = false;
      controller.abort();
    };
  }, [admitted, attempt, bypass, failedPath, pathname, router, status, userId]);

  if (bypass || status === "unauthenticated") return children;

  if (status === "loading" || (!admitted && failedPath !== pathname)) {
    return (
      <div className="min-h-[60vh] grid place-items-center" role="status" aria-live="polite">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-hidden />
          Preparing your collection…
        </div>
      </div>
    );
  }

  return (
    <>
      {failedPath === pathname && (
        <div className="fixed right-4 top-4 z-50">
          <button type="button" onClick={retry} className="rounded-xl border border-line bg-card px-3 py-2 text-xs font-medium shadow-lg">
            Check introduction
          </button>
        </div>
      )}
      {children}
    </>
  );
}
