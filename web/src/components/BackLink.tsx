"use client";

import { useRouter } from "next/navigation";

export function BackLink({ fallback, label }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="text-muted text-sm inline-flex items-center min-h-11 -ml-2 px-2 hover:text-fg transition-colors"
      aria-label={label ? `Back to ${label}` : "Back"}
    >
      ‹ {label ?? "Back"}
    </button>
  );
}
