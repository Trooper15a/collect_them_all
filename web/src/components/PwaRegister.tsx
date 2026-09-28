"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const DISMISS_KEY = "rnp-install-dismissed";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const VIEWS_KEY = "rnp-install-pageviews";
const FIRST_LOAD_DELAY_MS = 45_000; // never nag on the first-ever page load
const HIDDEN_PATHS = ["/landing", "/faq", "/auth/error", "/onboarding"];

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Date.parse(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}

function persistDismissal() {
  try {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
  } catch { /* storage unavailable */ }
}

function installInstructions(): string {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    const safari = /Safari\//.test(navigator.userAgent) &&
      !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    return safari
      ? "Tap Share, then Add to Home Screen."
      : "Open this site in Safari, tap Share, then Add to Home Screen.";
  }
  if (/Android/.test(navigator.userAgent)) {
    return "Open your browser menu (⋮), then tap Install app or Add to Home Screen.";
  }
  return "Use the install icon in your browser’s address bar, or its menu → Install app.";
}

/** Count full page loads; returns the running total (1 = first-ever visit). */
function bumpPageViews(): number {
  try {
    const n = Number(localStorage.getItem(VIEWS_KEY) ?? "0") + 1;
    localStorage.setItem(VIEWS_KEY, String(n));
    return n;
  } catch {
    return 1; // storage unavailable — treat as first visit, don't nag
  }
}

export function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [installing, setInstalling] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator &&
        (process.env.NODE_ENV === "production" || location.protocol === "https:")) {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("sw register failed", e));
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowFallback(false);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const onInstalled = () => {
      setDeferredPrompt(null);
      setVisible(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    // Deferred so server and first client render match (banner starts hidden).
    // Hide on public pages — it overlaps content and distracts new visitors.
    // Engagement gate: show instantly from the second visit onward, but on the
    // first-ever page load only after 45s on site.
    const engaged = bumpPageViews() >= 2;
    const showTimer = window.setTimeout(() => {
      const hiddenPath = HIDDEN_PATHS.some((p) => location.pathname.startsWith(p));
      if (!isInstalled() && !dismissedRecently() && !hiddenPath) setVisible(true);
    }, engaged ? 0 : FIRST_LOAD_DELAY_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Reserve space in .safe-bottom so the fixed banner never covers page content.
  useEffect(() => {
    const el = bannerRef.current;
    const root = document.documentElement;
    if (!visible || !el) return;
    const reserve = () =>
      root.style.setProperty("--pwa-banner-inset", `${el.offsetHeight + 8}px`);
    reserve();
    const ro = new ResizeObserver(reserve);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--pwa-banner-inset");
    };
  }, [visible, showFallback]);

  const dismiss = useCallback(() => {
    persistDismissal();
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      setShowFallback(true);
      return;
    }
    if (installing) return;
    setInstalling(true);
    setDeferredPrompt(null); // The browser allows each install event to be used only once.
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setVisible(false);
      else dismiss();
    } catch {
      setShowFallback(true);
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt, dismiss, installing]);

  if (!visible) return null;

  return (
    // z-30: below modal sheets (z-50) and the TabBar (z-40) so the banner can
    // never cover a bottom sheet's CTAs; its space is reserved via --pwa-banner-inset.
    <div ref={bannerRef} className="pwa-banner fixed left-4 right-4 z-30 mx-auto max-w-sm animate-in slide-in-from-bottom">
      <div className="rounded-2xl bg-card border border-line p-4 shadow-xl flex items-center gap-3">
        <div aria-hidden="true" className="shrink-0 w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-lg">
          +
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install RipnPull</p>
          <p className="text-xs text-muted">Quick access to your collection</p>
          {showFallback && !deferredPrompt && (
            <p className="text-xs text-muted mt-1" role="status">
              {installInstructions()}
            </p>
          )}
        </div>
        <button onClick={dismiss} className="text-muted hover:text-foreground text-lg px-1" aria-label="Dismiss">
          &times;
        </button>
        <button onClick={install} disabled={installing} className="btn-rainbow shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          {installing ? "Opening…" : deferredPrompt ? "Install" : "How to install"}
        </button>
      </div>
    </div>
  );
}
