"use client";

import { useEffect, useState } from "react";

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
