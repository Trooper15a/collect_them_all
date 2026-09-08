"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { setActiveTcg, useActiveTcg, type ActiveTcg } from "@/lib/ui-prefs";
import { TCGS } from "@/lib/types";

const PUBLIC_PATHS = ["/landing", "/login", "/privacy", "/terms"];
const ALL_ACCENT = "conic-gradient(from 0deg, #facc15, #f87171, #c084fc, #60a5fa, #34d399, #facc15)";

export function TcgPicker() {
  const pathname = usePathname();
  const active = useActiveTcg();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const hidden = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const activeMeta = active === "all" ? null : TCGS.find((t) => t.id === active) ?? null;
  const activeLabel = activeMeta?.label ?? "All games";
  const activeAccent = activeMeta?.accent ?? null;

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus management: move focus to the active option on open, return it to the
  // trigger on close.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const sheet = sheetRef.current;
    const selected = sheet?.querySelector<HTMLElement>('[aria-pressed="true"]');
    (selected ?? sheet)?.focus();
    return () => trigger?.focus();
  }, [open]);

  // Simple focus trap: keep Tab/Shift+Tab cycling inside the sheet.
  function trapTab(e: ReactKeyboardEvent) {
    if (e.key !== "Tab") return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const focusables = Array.from(sheet.querySelectorAll<HTMLElement>("button, [tabindex]")).filter((el) => el.tabIndex >= 0);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !sheet.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !sheet.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  if (hidden) return null;

  function pick(t: ActiveTcg) {
    setActiveTcg(t);
    setOpen(false);
  }

  return (
    <>
      {/* Floating trigger — top-left, offset below the safe-area and the page
          header row (h1 / BackLink headers end ~52px under the content top). */}
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-label={`Change game — currently ${activeLabel}`}
        aria-haspopup="dialog"
        className="fixed z-40 left-[max(env(safe-area-inset-left),12px)] top-[calc(max(env(safe-area-inset-top),12px)+56px)] w-10 h-10 rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex items-center justify-center text-black tap-scale"
      >
        <CardsIcon className="w-5 h-5" />
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
          style={{ background: activeAccent ?? ALL_ACCENT }}
        />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal aria-label="Choose game" onKeyDown={trapTab}>
          <button
            className="absolute inset-0 bg-black/60 anim-fade-up"
            style={{ animationDuration: "0.2s" }}
            onClick={() => setOpen(false)}
            aria-label="Close"
            tabIndex={-1}
          />
          <div
            ref={sheetRef}
            tabIndex={-1}
            className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)] max-h-[88vh] overflow-y-auto anim-widget d1 outline-none"
            style={{ animationName: "slide-up-sheet" }}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
            <div className="text-xs text-muted mb-3">Pick a game — search, scanner and sets follow this choice.</div>
            <ul className="divide-y divide-line stagger-children">
              <TcgRow
                label="All games"
                accent={ALL_ACCENT}
                selected={active === "all"}
                onSelect={() => pick("all")}
              />
              {TCGS.map((t) => (
                <TcgRow
                  key={t.id}
                  label={t.label}
                  accent={t.accent}
                  selected={active === t.id}
                  onSelect={() => pick(t.id)}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function TcgRow({ label, accent, selected, onSelect }: { label: string; accent: string; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="w-full flex items-center gap-3 py-3 text-left tap-scale"
      >
        <span aria-hidden className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: accent }} />
        <span className={`flex-1 min-w-0 truncate ${selected ? "font-semibold" : ""}`}>{label}</span>
        {selected && (
          <svg viewBox="0 0 24 24" className="w-5 h-5 icon-rainbow flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Selected">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    </li>
  );
}

function CardsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="5" width="12" height="16" rx="2" transform="rotate(6 13 13)" />
      <rect x="4" y="3" width="12" height="16" rx="2" stroke="currentColor" fill="white" />
      <path d="M8 9h4M8 12.5h4" />
    </svg>
  );
}
