"use client";

import { useEffect, useState } from "react";
import { TCGS, type Tcg } from "./types";

const KEY = "rnp-hide-prices";
const EVENT = "rnp-hide-prices-change";

export function getHidePrices(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setHidePrices(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {}
  // storage events don't fire in the same tab — notify in-page listeners
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useHidePrices(): boolean {
  // start false so SSR/CSR markup matches; sync from localStorage after mount
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const sync = () => setHidden(getHidePrices());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  return hidden;
}

// ── Active TCG (global game picker) ──────────────────────────────────────────

export type ActiveTcg = "all" | Tcg;

const TCG_KEY = "rnp-tcg";
const TCG_EVENT = "rnp-tcg-change";
const TCG_ID_SET = new Set<string>(TCGS.map((t) => t.id));

function isActiveTcg(v: string | null): v is ActiveTcg {
  return v === "all" || (v !== null && TCG_ID_SET.has(v));
}

export function getActiveTcg(): ActiveTcg {
  if (typeof window === "undefined") return "all";
  try {
    const v = window.localStorage.getItem(TCG_KEY);
    return isActiveTcg(v) ? v : "all";
  } catch {
    return "all";
  }
}

export function setActiveTcg(t: ActiveTcg): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TCG_KEY, t);
  } catch {}
  // storage events don't fire in the same tab — notify in-page listeners
  window.dispatchEvent(new CustomEvent(TCG_EVENT));
}

function useActiveTcgState(): { tcg: ActiveTcg; hydrated: boolean } {
  // start "all" so SSR/CSR markup matches; sync from localStorage after mount
  const [tcg, setTcg] = useState<ActiveTcg>("all");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const sync = () => {
      setTcg(getActiveTcg());
      setHydrated(true);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(TCG_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(TCG_EVENT, sync);
    };
  }, []);
  return { tcg, hydrated };
}

export function useActiveTcg(): ActiveTcg {
  return useActiveTcgState().tcg;
}

/**
 * Same as useActiveTcg, plus `hydrated`: false until the post-mount localStorage
 * sync has run. Fetch effects that key off the pref should wait for `hydrated`
 * so users who picked a game don't fire a throwaway tcg=all request first.
 */
export function useActiveTcgHydrated(): { tcg: ActiveTcg; hydrated: boolean } {
  return useActiveTcgState();
}
