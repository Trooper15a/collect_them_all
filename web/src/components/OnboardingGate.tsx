"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

const BYPASS = ["/landing", "/login", "/privacy", "/terms", "/faq", "/auth/error", "/onboarding"];

function bypassesGate(pathname: string) {
  return BYPASS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const bypass = bypassesGate(pathname);
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setCheckedPath(null);
    setFailedPath(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (bypass || status !== "authenticated") return;

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
        setFailedPath(null);
        setCheckedPath(pathname);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setFailedPath(pathname);
        setCheckedPath(pathname);
      }
    }

    void check();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, bypass, pathname, router, status]);

  if (bypass || status === "unauthenticated") return children;

  if (status === "loading" || checkedPath !== pathname) {
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