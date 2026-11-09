import type { Match } from "./matcher";

/** Route the top similarity score using the user's strictly-above-90% policy.
 * Ready cards still require the final destination/save action. */
export function clearPiMatch(matches: Match[]): Match | null {
  const top = matches[0];
  if (!top || !Number.isFinite(top.score) || top.score <= 0.9) return null;
  return top;
}
