"use client";

import { useCallback, useEffect } from "react";
import { prepareScanEngine } from "./preparation";

/** Start only after the persisted game preference has hydrated. */
export function useScanPreparation(tcg: string, hydrated: boolean): () => void {
  const prepare = useCallback(() => { void prepareScanEngine(tcg); }, [tcg]);
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(prepare, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(prepare, 500);
    return () => clearTimeout(timer);
  }, [hydrated, prepare]);
  return prepare;
}
