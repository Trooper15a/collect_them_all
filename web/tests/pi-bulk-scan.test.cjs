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
function cameraHarness({ match, detector, timers, issue } = {}) {
  let calls = 0, accepted = [];
  const props = { paused: false, count: 0, tcg: "pokemon", lang: "eng", onClose() {}, onMatches: (m, auto, capture) => { accepted.push({ m, auto, capture }); return auto ? true : undefined; } };
  const h = clientHarness("components/PiBulkScanner.tsx", {
    props, exportName: "PiBulkScanner",
    globals: {
      Blob, Error, AbortController, crypto: require("node:crypto").webcrypto,
      URL: class extends URL { static createObjectURL() { return "blob:photo"; } static revokeObjectURL() {} },
      createImageBitmap: async () => ({ width: 1000, height: 600, close() {} }),
      ...(timers ? { setTimeout: fn => { const id = Math.random(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) } : {}),
    },
    extraModules: {
      "@/lib/scanner/pi-camera": { connectPi: async () => {}, capturePi: async () => new Blob(["photo"]) },
      "@/lib/scanner/pi-framing": { sampleScene: () => ({}), framingIssue: () => issue },
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
  const h = clientHarness("app/scan/page.tsx", { globals: { crypto: require("node:crypto").webcrypto, window: { location: { search: "?camera=pi" }, history: { replaceState() {} } }, localStorage: { getItem: () => null, setItem() {} } }, extraModules: {
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

test("Finish scanning opens a results dialog even when no cards were queued", async () => {
  const h = clientHarness("app/scan/page.tsx", { globals: { crypto: require("node:crypto").webcrypto, window: { location: { search: "?camera=pi" }, history: { replaceState() {} } }, localStorage: { getItem: () => null, setItem() {} } }, extraModules: {
    "@/components/PiBulkScanner": { PiBulkScanner: "PiBulkScanner" }, "@/components/CardDiscovery": { CardDiscovery: "CardDiscovery" },
    "@/components/ScanLanguageBadge": { ScanLanguageBadge: "ScanLanguageBadge" }, "@/lib/scanner/use-scan-preparation": { useScanPreparation: () => () => {} },
  } });
  h.render(); await h.flush();
  nodes(h.render(), n => n.type === "PiBulkScanner")[0].props.onClose();
  const dialog = nodes(h.render(), n => n.props?.role === "dialog" && n.props["aria-label"] === "Scan results")[0];
  assert.ok(dialog, "finish should always show a results dialog");
  assert.match(text(dialog), /No cards/);
});

test("Finish scanning retains uncertain identified cards and offers a destination for ready cards", async () => {
  const storage = new Map();
  const saved = [];
  const h = clientHarness("app/scan/page.tsx", { globals: { crypto: require("node:crypto").webcrypto, window: { location: { search: "?camera=pi" }, history: { replaceState() {} } }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }, extraModules: {
    "@/components/PiBulkScanner": { PiBulkScanner: "PiBulkScanner" }, "@/components/CardDiscovery": { CardDiscovery: "CardDiscovery" },
    "@/components/ScanLanguageBadge": { ScanLanguageBadge: "ScanLanguageBadge" }, "@/lib/scanner/use-scan-preparation": { useScanPreparation: () => () => {} },
  }, fetch: async (url, init) => {
    if (url.endsWith("/items")) saved.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => url.includes("/api/cards/") ? { card: { id: "card1", name: "Card one" } } : { portfolios: [{ id: 2, name: "My binder" }] } };
  } });
  h.render(); await h.flush();
  let pi = nodes(h.render(), n => n.type === "PiBulkScanner")[0];
  await pi.props.onMatches([{ ...matches[0], score: 0.8 }, matches[1]], true, { captureId: "uncertain" });
  h.render(); await h.flush();
  assert.equal(JSON.parse(storage.get("bulkScanReview"))[0].id, "uncertain");
  pi = nodes(h.render(), n => n.type === "PiBulkScanner")[0]; pi.props.onClose();
  const dialog = nodes(h.render(), n => n.props?.role === "dialog" && n.props["aria-label"] === "Scan results")[0];
  assert.ok(dialog); assert.match(text(dialog), /Card one/); assert.match(text(dialog), /Needs confirmation/);
  assert.equal(nodes(dialog, n => n.type === "select" && n.props["aria-label"] === "Destination binder").length, 1);
  nodes(dialog, n => text(n) === "Review match" && n.props?.onClick)[0].props.onClick();
  await nodes(h.render(), n => n.type === "button" && text(n).includes("Card one"))[0].props.onClick();
  assert.match(text(h.render()), /1 ready to save/);
  h.render(); await h.flush();
  assert.equal(JSON.parse(storage.get("bulkScanReview")).length, 0);
  assert.equal(JSON.parse(storage.get("bulkQueue")).length, 1);
  await nodes(h.render(), n => text(n) === "Add all (1)" && n.props?.onClick)[0].props.onClick();
  assert.equal(saved[0].url, "/api/portfolios/2/items");
  assert.equal(saved[0].body.cardId, "card1");
  assert.match(text(h.render()), /Added 1 card to My binder/);
});

test("suspect framing prevents automatic queueing even for a strong match", async () => {
  const timers = new Map();
  const { h, accepted, click } = cameraHarness({ timers, match: async () => matches, issue: "The card may be cut off." });
  h.render(); await h.flush();
  await click("Connect Pi camera"); await click("Stand is empty — start automatic scanning");
  const [id, tick] = timers.entries().next().value; timers.delete(id); tick(); await settle();
  assert.equal(accepted[0].auto, false);
  assert.match(accepted[0].capture.issue, /cut off/);
  await click("Stop automatic scanning");
});

test("framing check sends half cards, edge cutoffs and scan-area cutoffs to review", () => {
  const { framingIssue } = pure("lib/scanner/pi-framing.ts", { Uint8ClampedArray, Uint8Array });
  const empty = { width: 96, height: 64, aspect: 16 / 9, pixels: new Uint8ClampedArray(96 * 64 * 4).fill(90) };
  const crop = { x: 0.3, y: 0.06, width: 0.4, height: 0.88 };
  function frame(x1, y1, x2, y2) {
    const pixels = empty.pixels.slice();
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) pixels.set([220, 120, 30, 255], (y * 96 + x) * 4);
    return { ...empty, pixels };
  }
  assert.equal(framingIssue(frame(35, 7, 60, 56), empty, crop), undefined);
  assert.match(framingIssue(frame(35, 30, 60, 56), empty, crop), /whole upright card/);
  assert.match(framingIssue(frame(35, 7, 47, 56), empty, crop), /whole upright card/);
  assert.match(framingIssue(frame(35, 0, 60, 56), empty, crop), /cut off/);
  assert.match(framingIssue(frame(35, 7, 60, 56), empty, { ...crop, x: 0.4, width: 0.2 }), /outside the scan area/);
  assert.match(framingIssue(empty, empty, crop), /Could not verify/);
});

test("refreshing finished results restores ready and unconfirmed cards without reopening the camera", async () => {
  const storage = new Map([
    ["bulkQueue", JSON.stringify([{ id: "card1", name: "Card one" }])],
    ["bulkScanReview", JSON.stringify([{ id: "pending-copy", matches }])],
  ]);
  const h = clientHarness("app/scan/page.tsx", { globals: { window: { location: { search: "?review=1" } }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }, extraModules: {
    "@/components/PiBulkScanner": { PiBulkScanner: "PiBulkScanner" }, "@/components/CardDiscovery": { CardDiscovery: "CardDiscovery" },
    "@/components/ScanLanguageBadge": { ScanLanguageBadge: "ScanLanguageBadge" }, "@/lib/scanner/use-scan-preparation": { useScanPreparation: () => () => {} },
  } });
  h.render(); await h.flush(); h.render(); await h.flush();
  const tree = h.render();
  const dialog = nodes(tree, n => n.props?.role === "dialog" && n.props["aria-label"] === "Scan results")[0];
  assert.ok(dialog); assert.match(text(dialog), /1 ready to save · 1 need confirmation/);
  assert.equal(nodes(tree, n => n.type === "PiBulkScanner").length, 0);
  assert.equal(JSON.parse(storage.get("bulkQueue")).length, 1);
  assert.equal(JSON.parse(storage.get("bulkScanReview")).length, 1);
});
