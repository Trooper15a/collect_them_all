"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { setActiveTcg, useActiveTcg, type ActiveTcg } from "@/lib/ui-prefs";
import { TCGS } from "@/lib/types";

const PUBLIC_PATHS = ["/landing", "/login", "/privacy", "/terms", "/faq", "/auth/error", "/onboarding"];

export function TcgPicker() {
  const pathname = usePathname();
  const active = useActiveTcg();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const activeLabel = TCGS.find((t) => t.id === active)?.label ?? "All games";
  const hidden = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || hidden || !dialog) return;
    dialog.showModal();
    selectedRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, hidden]);

  if (hidden) return null;

  function pick(tcg: ActiveTcg) {
    setActiveTcg(tcg);
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="game-picker-trigger" aria-label={`Change game — currently ${activeLabel}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="truncate">{activeLabel}</span>
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m7 10 5 5 5-5" /></svg>
      </button>
      <dialog ref={dialogRef} className="more-dialog" aria-label="Choose game" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-lg font-medium">Choose game</h2>
          <button type="button" className="sheet-close" aria-label="Close game picker" onClick={() => setOpen(false)}><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </div>
        <p className="text-sm text-muted mb-3">Search, scanner and sets follow this choice</p>
        <ul className="divide-y divide-line">
          {[{ id: "all" as const, label: "All games", accent: "var(--accent)" }, ...TCGS].map((t) => (
            <li key={t.id}>
              <button ref={active === t.id ? selectedRef : undefined} type="button" aria-pressed={active === t.id} className="w-full flex items-center gap-3 py-3 text-left min-h-12" onClick={() => pick(t.id)}>
                <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ background: t.accent }} />
                <span className="flex-1 min-w-0">{t.label}</span>
                {active === t.id && <svg className="w-5 h-5 text-fg shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Selected"><path d="m5 12 4 4L19 6" /></svg>}
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
