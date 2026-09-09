/**
 * Single source of truth for graded-value multipliers (multiple of the raw market price).
 * Used by the portfolio valuation (lib/portfolio.ts), the card page's graded estimates,
 * and the grade estimator — keep them in sync by editing here only.
 */
export const GRADE_MULT: Record<string, number> = {
  "PSA 10": 3.0,
  "PSA 9": 1.4,
  "PSA 8": 1.0,
  "BGS 10": 4.5,
  "BGS 9.5": 2.5,
  "BGS 9": 1.3,
  "CGC 10": 2.8,
  "CGC 9.5": 1.6,
  "CGC 9": 1.2,
};
