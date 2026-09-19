"use client";

import { useEffect, useState } from "react";

interface OfflineState {
  online: boolean;
}

export function OfflineStatus() {
  const [state, setState] = useState<OfflineState>({ online: true });

  useEffect(() => {
    const update = () => setState((s) => ({ ...s, online: navigator.onLine }));
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <div className="card-surface rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${state.online ? "bg-up" : "bg-down"}`} />
          <span className="text-sm font-medium">{state.online ? "Online" : "Offline"}</span>
        </div>
      </div>
      <div className="text-xs text-muted">
        {state.online
          ? "Public scanner assets and card images are cached. Private collection data and changes require an internet connection."
          : "You're offline. Reconnect to load your collection or save changes. Changes are not queued."}
      </div>

    </div>
  );
}

export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bg-accent/10 border border-accent/20 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
      <span className="inline-block w-2 h-2 rounded-full bg-down" />
      <span className="text-xs text-fg">You&rsquo;re offline — reconnect to load or update your collection</span>
    </div>
  );
}
