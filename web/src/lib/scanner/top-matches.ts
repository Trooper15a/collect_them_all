export interface ScoredMatch {
  score: number;
}

/** Maintain a small descending top-k list without allocating and sorting every candidate. */
export function insertTopMatch<T extends ScoredMatch>(best: T[], candidate: T, k: number): void {
  if (k <= 0) return;
  if (best.length === k && candidate.score <= best[best.length - 1].score) return;

  let position = best.findIndex((entry) => candidate.score > entry.score);
  if (position === -1) position = best.length;
  best.splice(position, 0, candidate);
  if (best.length > k) best.pop();
}

/** Prefer the requested language when its best result is within the existing score tolerance. */
export function selectPreferredMatches<T extends ScoredMatch>(overall: T[], preferred: T[], tolerance = 0.05): T[] {
  if (preferred.length > 0 && overall.length > 0 && preferred[0].score >= overall[0].score - tolerance) {
    return preferred;
  }
  return overall;
}
