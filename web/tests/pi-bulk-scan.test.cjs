/* eslint-disable @typescript-eslint/no-require-imports -- Exercise browser event handlers in the Node harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");
const { clientHarness, nodes, text } = require("./client-harness.cjs");
const matches = [{ card: { id: "card1", name: "Card one" }, score: 0.98 }, { card: { id: "card2" }, score: 0.7 }];
const settle = () => new Promise(setImmediate);
function pure(file, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Float32Array, Error, Uint8Array, AbortSignal, ...globals });
  return exports;
}
function cameraHarness({ match, detector, timers } = {}) {
  let calls = 0, accepted = [];
  const props = { paused: false, count: 0, tcg: "pokemon", lang: "eng", onClose() {}, onMatches: (m, auto) => { accepted.push({ m, auto }); return auto ? true : undefined; } };
  const h = clientHarness("components/PiBulkScanner.tsx", {
    props, exportName: "PiBulkScanner",
    globals: {
      Blob, Error, AbortController,
      URL: class extends URL { static createObjectURL() { return "blob:photo"; } static revokeObjectURL() {} },
      createImageBitmap: async () => ({ width: 1000, height: 600, close() {} }),
      ...(timers ? { setTimeout: fn => { const id = Math.random(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) } : {}),
    },
    extraModules: {
      "@/lib/scanner/pi-camera": { connectPi: async () => {}, capturePi: async () => new Blob(["photo"]) },
      "@/lib/scanner/stand-detector": { StandDetector: detector ?? class { calibrate() {} observe() { return "capture"; } }, imageFingerprint: () => new Float32Array(3) },
      "@/lib/scanner/preprocess": { preprocess: (_, crop) => { assert.equal(crop.w, 400); return new Float32Array(1); } },
      "@/lib/scanner/engine": { getScanEngine: async () => ({ status: "ready", match: match ?? (async (_, k, tcg, lang) => { assert.equal(tcg, "pokemon"); assert.equal(lang, "eng"); if (++calls === 1) throw new Error("Connection failed"); return matches; }) }) },
    },
  });
  const button = label => nodes(h.render(), n => text(n) === label && typeof n.props?.onClick === "function")[0];
  const click = async label => { button(label).props.onClick(); await settle(); h.render(); await h.flush(); };
  return { h, props, accepted, button, click };
}

test("Pi connects and previews inside the app without any popup, and matching can retry", async () => {
  const { h, accepted, click } = cameraHarness();
  h.render(); await h.flush();
  await click("Connect Pi camera");
  assert.equal(nodes(h.render(), n => n.type === "img").length, 1);
  await click("Identify card");
  assert.match(text(h.render()), /Connection failed/);
  await click("Identify card");
  assert.equal(accepted[0].m, matches);
  assert.equal(accepted[0].auto, false);
});

test("calibrated automatic capture identifies without clicks and stops late inference from queueing", async () => {
  const timers = new Map();
  let release;
  const { h, accepted, click } = cameraHarness({ timers, match: () => new Promise(resolve => { release = resolve; }) });
  h.render(); await h.flush();
  await click("Connect Pi camera");
  await click("Stand is empty — start automatic scanning");
  const [id, tick] = timers.entries().next().value; timers.delete(id); tick(); await settle();
  assert.equal(typeof release, "function");
  await click("Stop automatic scanning");
  release(matches); await settle();
  assert.equal(accepted.length, 0);
});

test("automatic capture sends clear matches for automatic queueing", async () => {
  const timers = new Map();
  const { h, accepted, click } = cameraHarness({ timers, match: async () => matches });
  h.render(); await h.flush();
  await click("Connect Pi camera"); await click("Stand is empty — start automatic scanning");
  const [id, tick] = timers.entries().next().value; timers.delete(id); tick(); await settle();
  assert.equal(accepted[0].auto, true);
  assert.match(text(h.render()), /Card queued/);
  await click("Stop automatic scanning");
});

test("stand detection ignores motion/exposure shifts and requires removal before another identical copy", () => {
  const { StandDetector, frameDistance } = pure("lib/scanner/stand-detector.ts");
  const empty = new Float32Array(300).fill(90);
  const card = Float32Array.from(empty, (_, i) => i % 6 < 3 ? 30 : 180);
  const hand = Float32Array.from(empty, (_, i) => i % 12 < 6 ? 10 : 230);
  const d = new StandDetector(); d.calibrate(empty);
  assert.equal(frameDistance(empty, new Float32Array(300).fill(130)), 0);
  for (let i = 0; i < 8; i++) assert.equal(d.observe(i % 2 ? card : hand), "settling");
  d.observe(card); assert.equal(d.observe(card), "capture");
  for (let i = 0; i < 5; i++) assert.equal(d.observe(card), "remove");
  d.observe(empty); assert.equal(d.observe(card), "remove");
  d.observe(empty); d.observe(empty); d.observe(card); d.observe(card);
  assert.equal(d.observe(card), "capture");
});

test("only strong separated matches autoqueue; ambiguous/single/invalid scores require review", () => {
  const { clearPiMatch } = pure("lib/scanner/pi-auto.ts");
  assert.equal(clearPiMatch(matches), matches[0]);
  for (const candidate of [[], [matches[0]], [{ ...matches[0], score: 0.9 }, matches[1]],
    [matches[0], { ...matches[1], score: 0.96 }], [{ ...matches[0], score: NaN }, matches[1]]]) assert.equal(clearPiMatch(candidate), null);
});

test("direct Pi requests use fixed USB address, permission hint and omitted credentials, and reject invalid JPEGs", async () => {
  const requests = [];
  let bad = false;
  const camera = pure("lib/scanner/pi-camera.ts", { fetch: async (url, init) => {
    requests.push({ url, init });
    return url.endsWith("health") ? { ok: true, json: async () => ({ ready: true, directCapture: true }) }
      : new Response(new Blob([bad ? "bad!" : Uint8Array.of(255, 216, 255, 217)]), { headers: { "Content-Type": "image/jpeg" } });
  } });
  await camera.connectPi(); assert.equal((await camera.capturePi()).size, 4);
  for (const r of requests) { assert.ok(r.url.startsWith("http://10.12.194.1:8000/")); assert.equal(r.init.credentials, "omit"); assert.equal(r.init.targetAddressSpace, "local"); }
  bad = true; await assert.rejects(camera.capturePi(), /invalid JPEG/);
});

test("Pi automatic clear matches reuse the bulk queue and uncertain matches open the existing chooser", async () => {
  const h = clientHarness("app/scan/page.tsx", { globals: { window: { location: { search: "?camera=pi" } }, localStorage: { getItem: () => null, setItem() {} } }, extraModules: {
    "@/components/PiBulkScanner": { PiBulkScanner: "PiBulkScanner" },
    "@/components/CardDiscovery": { CardDiscovery: "CardDiscovery" },
    "@/components/ScanLanguageBadge": { ScanLanguageBadge: "ScanLanguageBadge" },
    "@/lib/scanner/use-scan-preparation": { useScanPreparation: () => () => {} },
  }, fetch: async url => ({ ok: true, json: async () => url.includes("/api/cards/") ? { card: { id: "card1", name: "Card one" } } : { portfolios: [] } }) });
  h.render(); await h.flush();
  let pi = nodes(h.render(), n => n.type === "PiBulkScanner")[0];
  assert.equal(await pi.props.onMatches(matches, true), true);
  pi = nodes(h.render(), n => n.type === "PiBulkScanner")[0]; assert.equal(pi.props.count, 1);
  await pi.props.onMatches([{ ...matches[0], score: 0.8 }, matches[1]], true);
  const choose = nodes(h.render(), n => n.type === "button" && text(n).includes("Card one"))[0];
  await choose.props.onClick();
  pi = nodes(h.render(), n => n.type === "PiBulkScanner")[0]; assert.equal(pi.props.count, 2);
  assert.equal(nodes(h.render(), n => n.type === "Scanner").length, 0);
});
