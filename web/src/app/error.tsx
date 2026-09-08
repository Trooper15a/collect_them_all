"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("RipnPull crashed:", error);
  }, [error]);

  return (
    <div className="card-surface rounded-3xl p-8 mt-8 text-center max-w-md mx-auto">
      <h1 className="text-xl font-bold text-fg">Something went wrong</h1>
      <p className="text-sm text-muted mt-2 mb-6">RipnPull hit an unexpected error. Your collection data is safe.</p>
      <button onClick={reset} className="btn-rainbow rounded-xl px-5 py-2.5 text-sm">
        Try again
      </button>
    </div>
  );
}
