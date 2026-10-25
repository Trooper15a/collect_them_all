"use client";

import { TCG_IDS } from "@/lib/types";

let modelPreparation: Promise<void> | null = null;
const indexPreparations = new Map<string, { promise: Promise<void>; preparedAt: number }>();
const INDEX_PREPARATION_TTL = 5 * 60 * 1000;

/** Best-effort idle/intent work; never requests camera access or identifies a card. */
export async function prepareScanEngine(tcg?: string): Promise<void> {
  if (tcg && tcg !== "all" && !TCG_IDS.some(id => id === tcg)) return;
  const key = !tcg || tcg === "all" ? "all" : tcg;
  if (!modelPreparation) {
    modelPreparation = import("./engine")
      .then(module => module.getScanEngine())
      .then(engine => { if (engine.status !== "ready") modelPreparation = null; })
      .catch(() => { modelPreparation = null; });
  }
  let index = indexPreparations.get(key);
  if (!index || (index.preparedAt > 0 && Date.now() - index.preparedAt >= INDEX_PREPARATION_TTL)) {
    index = { promise: Promise.resolve(), preparedAt: 0 };
    const entry = index;
    indexPreparations.set(key, entry);
    entry.promise = fetch(`/api/scan/match${key === "all" ? "" : `?tcg=${encodeURIComponent(key)}`}`, {
      method: "GET", signal: AbortSignal.timeout(15000), cache: "no-store",
    }).then(response => {
      if (!response.ok) throw new Error("Scanner index unavailable");
      entry.preparedAt = Date.now();
    }).catch(() => { indexPreparations.delete(key); });
  }
  await Promise.all([modelPreparation, index.promise]);
}
