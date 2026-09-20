import test from "node:test";
import assert from "node:assert/strict";

// @ts-expect-error Node's native TypeScript test runner requires the file extension.
import { insertTopMatch, selectPreferredMatches } from "../src/lib/scanner/top-matches.ts";

type Candidate = { id: string; score: number; lang?: string };

test("insertTopMatch retains only the highest scoring candidates", () => {
  const best: Candidate[] = [];
  for (const candidate of [
    { id: "low", score: 0.2 },
    { id: "best", score: 0.9 },
    { id: "middle", score: 0.6 },
    { id: "second", score: 0.8 },
  ]) {
    insertTopMatch(best, candidate, 2);
  }

  assert.deepEqual(best.map((entry) => entry.id), ["best", "second"]);
});

test("selectPreferredMatches keeps the existing language tolerance", () => {
  const overall: Candidate[] = [
    { id: "jp", score: 0.91, lang: "ja" },
    { id: "en", score: 0.88, lang: "en" },
  ];
  const english: Candidate[] = [{ id: "en", score: 0.88, lang: "en" }];

  assert.deepEqual(selectPreferredMatches(overall, english).map((entry) => entry.id), ["en"]);
  assert.deepEqual(
    selectPreferredMatches(overall, [{ id: "weak-en", score: 0.7, lang: "en" }]).map((entry) => entry.id),
    ["jp", "en"],
  );
});
