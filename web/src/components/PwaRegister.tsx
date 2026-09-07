"use client";

import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !location.protocol.startsWith("https")) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("sw register failed", e));

    const syncOnReconnect = () => {
      navigator.serviceWorker.controller?.postMessage("SYNC_QUEUE");
    };
    window.addEventListener("online", syncOnReconnect);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("online", syncOnReconnect);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
    else setDismissed(true);
  }, [deferredPrompt]);

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm animate-in slide-in-from-bottom">
      <div className="rounded-2xl bg-card border border-line p-4 shadow-xl flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-lg">
          +
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install RipnPull</p>
          <p className="text-xs text-muted">Track your collection offline</p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-muted hover:text-foreground text-lg px-1" aria-label="Dismiss">
          &times;
        </button>
        <button onClick={install} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/80 transition-colors">
          Install
        </button>
      </div>
    </div>
  );
}
