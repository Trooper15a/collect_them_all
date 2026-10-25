/* eslint-disable @typescript-eslint/no-require-imports -- This Node test harness executes the client module in an isolated VM. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");

function engineHarness({ failFirst = false, matchStatus = 200, offline = false, matchDelay = 0, run, missingModel = false } = {}) {
  const requests = [];
  let sessions = 0;
  let releases = 0;
  const inputs = [];
  const ort = {
    env: { wasm: {} },
    Tensor: class { constructor(_type, data) { this.data = data; } },
    InferenceSession: { create: async () => {
      sessions++;
      if (missingModel || (failFirst && sessions <= 2)) throw new Error("Offline");
      return {
      inputNames: ["input"], outputNames: ["output"],
      run: async ({ input }) => {
        inputs.push(input.data);
        if (run) await run(input.data);
        return { output: { data: new Float32Array([1, 0]) } };
      },
      release: async () => { releases++; },
    }; } },
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
        return { ok: !missingModel, headers: { get: () => missingModel ? "text/html" : "application/octet-stream" } };
      }
      throw new Error(`Unexpected download: ${url}`);
    },
  });
  return { getScanEngine: exports.getScanEngine, requests, inputs, sessions: () => sessions, releases: () => releases };
}

test("engine becomes ready without downloading the server's card index", async () => {
  const harness = engineHarness();
  const engine = await harness.getScanEngine();
  assert.equal(engine.status, "ready");
  assert.deepEqual(harness.requests, []);
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
  assert.equal(harness.sessions(), 1);
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

test("a missing model still explains scanner unavailability", async () => {
  const h = engineHarness({ missingModel: true });
  const engine = await h.getScanEngine();
  assert.equal(engine.status, "missing");
  assert.match(engine.error, /model is unavailable/);
  assert.deepEqual(h.requests, ["/model/card_embedder.onnx"]);
});

test("loading completes one blank inference before a shared engine becomes ready", async () => {
  let release;
  const inference = new Promise(resolve => { release = resolve; });
  const harness = engineHarness({ run: () => inference });
  const first = harness.getScanEngine();
  const opened = harness.getScanEngine();
  let ready = false;
  first.then(() => { ready = true; });
  await new Promise(setImmediate);
  assert.equal(harness.sessions(), 1);
  assert.equal(harness.inputs.length, 1);
  assert.equal(harness.inputs[0].length, 3 * 224 * 224);
  assert.ok(harness.inputs[0].every(value => value === 0));
  assert.equal(ready, false);
  assert.equal(harness.requests.length, 0, "blank inference must not publish a matching request");
  release();
  assert.equal(await opened, await first);
});

test("public embeddings and matching cannot overlap ONNX inference", async () => {
  let active = 0, maximum = 0;
  const harness = engineHarness({ run: async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(setImmediate);
    active--;
  } });
  const engine = await harness.getScanEngine();
  await Promise.all([engine.embed(new Float32Array([1])), engine.match(new Float32Array([2]))]);
  assert.equal(maximum, 1);
  assert.equal(harness.inputs.length, 3);
});

test("failed blank initialization can retry without returning a broken engine", async () => {
  let first = true;
  const harness = engineHarness({ run: async () => { if (first) { first = false; throw new Error("Kernel failed"); } } });
  assert.notEqual((await harness.getScanEngine()).status, "ready");
  assert.equal(harness.releases(), 1, "failed kernel initialization must release its session before retrying");
  assert.equal((await harness.getScanEngine()).status, "ready");
});
