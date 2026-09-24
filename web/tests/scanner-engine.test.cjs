/* eslint-disable @typescript-eslint/no-require-imports -- This Node test harness executes the client module in an isolated VM. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");

function engineHarness({ failFirst = false, matchStatus = 200, offline = false, matchDelay = 0 } = {}) {
  const requests = [];
  let heads = 0;
  const ort = {
    env: { wasm: {} },
    Tensor: class {},
    InferenceSession: { create: async () => ({
      inputNames: ["input"], outputNames: ["output"],
      run: async () => ({ output: { data: new Float32Array([1, 0]) } }),
    }) },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/scanner/engine.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, setTimeout, clearTimeout, AbortSignal,
    navigator: { hardwareConcurrency: 4 },
    require: name => {
      if (name === "onnxruntime-web") return ort;
      if (name === "./preprocess") return { IMAGE_SIZE: 224 };
      if (name === "./task") {
        const taskExports = {};
        vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/scanner/task.ts"), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS },
        }).outputText, { exports: taskExports, setTimeout, clearTimeout });
        return taskExports;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: async (url, options) => {
      requests.push(url);
      if (url === "/api/scan/match") {
        if (offline) throw new TypeError("Failed to fetch");
        if (matchDelay) await new Promise((resolve, reject) => {
          const onAbort = () => { clearTimeout(timer); reject(options.signal.reason); };
          const timer = setTimeout(() => { options.signal.removeEventListener("abort", onAbort); resolve(); }, matchDelay);
          options.signal.addEventListener("abort", onAbort, { once: true });
        });
        return { ok: matchStatus === 200, status: matchStatus, json: async () => ({ matches: [] }) };
      }
      if (options?.method === "HEAD") {
        heads++;
        if (failFirst && heads === 1) throw new Error("Offline");
        return { ok: true, headers: { get: () => "application/octet-stream" } };
      }
      throw new Error(`Unexpected download: ${url}`);
    },
  });
  return { getScanEngine: exports.getScanEngine, requests };
}

test("engine becomes ready without downloading the server's card index", async () => {
  const harness = engineHarness();
  const engine = await harness.getScanEngine();
  assert.equal(engine.status, "ready");
  assert.deepEqual(harness.requests, ["/model/card_embedder.onnx"]);
});

test("a cold matching server gets enough time to answer without duplicate retries", async () => {
  const harness = engineHarness({ matchDelay: 4000 });
  const engine = await harness.getScanEngine();
  const matches = await engine.match(new Float32Array());
  assert.equal(matches.length, 0);
  assert.equal(harness.requests.filter(url => url === "/api/scan/match").length, 1);
});

test("ready engine is reused across scanner openings", async () => {
  const harness = engineHarness();
  const first = await harness.getScanEngine();
  assert.equal(await harness.getScanEngine(), first);
  assert.equal(harness.requests.length, 1);
});

test("matching failures explain server unavailability and connection failures", async () => {
  const unavailable = await engineHarness({ matchStatus: 503 }).getScanEngine();
  await assert.rejects(unavailable.match(new Float32Array()), /temporarily unavailable/);
  const offline = await engineHarness({ offline: true }).getScanEngine();
  await assert.rejects(offline.match(new Float32Array()), /Check your connection/);
});

test("a failed model initialization can be retried", async () => {
  const harness = engineHarness({ failFirst: true });
  assert.notEqual((await harness.getScanEngine()).status, "ready");
  assert.equal((await harness.getScanEngine()).status, "ready");
});
