import type { Match } from "./matcher";

/** Similarity alone is not certainty: require a strong best match and a clear
 * gap from every different catalog entry. The user can review the bulk queue. */
export function clearPiMatch(matches: Match[]): Match | null {
  const top = matches[0];
  if (!top || !Number.isFinite(top.score) || top.score < 0.95 || matches.length < 2) return null;
  const next = matches.find((match, index) => index > 0 && match.card.id !== top.card.id);
  if (!next || !Number.isFinite(next.score) || top.score - next.score < 0.05) return null;
  return top;
}
