/* eslint-disable @typescript-eslint/no-require-imports -- Isolate idle/intent preparation without camera or model downloads. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(name, globals) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/scanner", name), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URLSearchParams, AbortSignal, setTimeout, clearTimeout, ...globals });
  return exports;
}

function preparationHarness({ failedModel = false, failedIndex = false } = {}) {
  let engines = 0;
  const requests = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const api = load("preparation.ts", {
    require: name => {
      if (name === "./engine") return { getScanEngine: async () => {
        engines++;
        await pending;
        if (failedModel && engines === 1) return { status: "error" };
        return { status: "ready" };
      } };
      if (name === "@/lib/types") return { TCG_IDS: ["pokemon", "mtg"] };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: async (url, options) => {
      requests.push({ url, method: options?.method ?? "GET" });
      await pending;
      return { ok: !failedIndex || requests.length > 1 };
    },
  });
  return { ...api, engines: () => engines, requests, release };
}

test("preparation before camera loads a shared engine and only a scoped readiness GET", async () => {
  const h = preparationHarness();
  const a = h.prepareScanEngine("pokemon"), b = h.prepareScanEngine("pokemon");
  await new Promise(setImmediate);
  assert.equal(h.engines(), 1);
  assert.deepEqual(h.requests, [{ url: "/api/scan/match?tcg=pokemon", method: "GET" }]);
  h.release();
  await Promise.all([a, b]);
  await h.prepareScanEngine("pokemon");
  assert.equal(h.engines(), 1);
  assert.equal(h.requests.length, 1);
});

test("failed preparation is best effort and retryable while successful work stays cached", async () => {
  const h = preparationHarness({ failedModel: true });
  const pending = h.prepareScanEngine("pokemon");
  h.release();
  await pending;
  await h.prepareScanEngine("pokemon");
  assert.equal(h.engines(), 2);
  assert.equal(h.requests.length, 1);
});

test("a failed readiness fetch retries without initializing another ready engine", async () => {
  const h = preparationHarness({ failedIndex: true });
  h.release();
  await h.prepareScanEngine("pokemon");
  await h.prepareScanEngine("pokemon");
  assert.equal(h.engines(), 1);
  assert.equal(h.requests.length, 2);
});

test("preparation rejects unbounded game keys without network or model work", async () => {
  const h = preparationHarness();
  await h.prepareScanEngine("not-a-game");
  assert.equal(h.engines(), 0);
  assert.equal(h.requests.length, 0);
});

test("idle preparation waits for hydrated preferences and cancels on navigation", async () => {
  const effects = [], requests = [], cancelled = [];
  let idle;
  const api = load("use-scan-preparation.ts", {
    window: { requestIdleCallback: cb => { idle = cb; return 42; }, cancelIdleCallback: id => cancelled.push(id) },
    require: name => name === "react"
      ? { useCallback: fn => fn, useEffect: fn => effects.push(fn) }
      : { prepareScanEngine: async tcg => requests.push(tcg) },
  });
  api.useScanPreparation("all", false);
  effects.pop()();
  assert.equal(idle, undefined);
  const intent = api.useScanPreparation("pokemon", true);
  const cleanup = effects.pop()();
  assert.equal(requests.length, 0);
  idle();
  intent();
  assert.deepEqual(requests, ["pokemon", "pokemon"]);
  cleanup();
  assert.deepEqual(cancelled, [42]);
});
