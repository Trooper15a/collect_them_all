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
  const { h, props, accepted, click } = cameraHarness();
  const progress = []; props.onProgress = value => progress.push(value);
  h.render(); await h.flush();
  await click("Connect Pi camera");
  assert.equal(nodes(h.render(), n => n.type === "img").length, 1);
  await click("Identify card");
  assert.match(text(h.render()), /Connection failed/);
  await click("Identify card");
  assert.equal(accepted[0].m, matches);
  assert.equal(accepted[0].auto, false);
  assert.equal(progress.at(-1).captured, 1);
  assert.equal(progress.at(-1).identified, 1);
  assert.equal(progress.at(-1).failed, 0);
  assert.ok(progress.some(value => value.failed === 1));
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

test("stand detection ignores motion/exposure shifts and supports removal for another identical copy", () => {
  const { StandDetector, frameDistance } = pure("lib/scanner/stand-detector.ts");
  const empty = new Float32Array(300).fill(90);
  const card = Float32Array.from(empty, (_, i) => i % 6 < 3 ? 30 : 180);
  const hand = Float32Array.from(empty, (_, i) => i % 12 < 6 ? 10 : 230);
  const d = new StandDetector(); d.calibrate(empty);
  assert.equal(frameDistance(empty, new Float32Array(300).fill(130)), 0);
  for (let i = 0; i < 8; i++) assert.equal(d.observe(i % 2 ? card : hand), "settling");
  d.observe(empty); d.observe(card); assert.equal(d.observe(card), "capture");
  for (let i = 0; i < 5; i++) assert.equal(d.observe(card), "unchanged");
  d.observe(empty); assert.equal(d.observe(card), "unchanged");
  d.observe(empty); d.observe(empty); d.observe(card);
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

test("four automatic identifications retain one ready card and three reviews without pausing", async () => {
  const h = clientHarness("app/scan/page.tsx", { globals: { crypto: require("node:crypto").webcrypto, window: { location: { search: "?camera=pi" }, history: { replaceState() {} } }, localStorage: { getItem: () => null, setItem() {} } }, extraModules: {
    "@/components/PiBulkScanner": { PiBulkScanner: "PiBulkScanner" },
    "@/components/CardDiscovery": { CardDiscovery: "CardDiscovery" },
    "@/components/ScanLanguageBadge": { ScanLanguageBadge: "ScanLanguageBadge" },
    "@/lib/scanner/use-scan-preparation": { useScanPreparation: () => () => {} },
  }, fetch: async url => ({ ok: true, json: async () => url.includes("/api/cards/") ? { card: { id: "card1", name: "Card one" } } : { portfolios: [] } }) });
  h.render(); await h.flush();
  let pi = nodes(h.render(), n => n.type === "PiBulkScanner")[0];
  const initialFinish = pi.props.onClose;
  assert.equal(await pi.props.onMatches(matches, true), true);
  pi = nodes(h.render(), n => n.type === "PiBulkScanner")[0]; assert.equal(pi.props.count, 1);
  for (let i = 0; i < 3; i++) {
    assert.equal(await pi.props.onMatches([{ ...matches[0], score: 0.8 }, matches[1]], true, { captureId: `uncertain-${i}` }), "review");
    pi = nodes(h.render(), n => n.type === "PiBulkScanner")[0];
    assert.equal(pi.props.paused, false);
    assert.equal(pi.props.count, 1);
    assert.equal(pi.props.reviewCount, i + 1);
  }
  pi.props.onProgress({ captured: 4, identified: 4, failed: 0 });
  assert.equal(nodes(h.render(), n => n.type === "Scanner").length, 0);
  initialFinish();
  const dialog = nodes(h.render(), n => n.props?.role === "dialog" && n.props["aria-label"] === "Scan results")[0];
  assert.match(text(dialog), /1 ready to save .* 3 need confirmation/);
  assert.match(text(dialog), /4 captured .* 4 identified .* 0 need retry/);
  assert.equal(nodes(dialog, n => text(n) === "Review match" && n.props?.onClick).length, 3);
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

test("automatic framing warnings retain their source so the parent can defer review", async () => {
  const timers = new Map();
  const { h, accepted, click } = cameraHarness({ timers, match: async () => matches, issue: "The card may be cut off." });
  h.render(); await h.flush();
  await click("Connect Pi camera"); await click("Stand is empty — start automatic scanning");
  const [id, tick] = timers.entries().next().value; timers.delete(id); tick(); await settle();
  assert.equal(accepted[0].auto, true);
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
    ["piScanProgress", JSON.stringify({ captured: 4, identified: 2, failed: 2 })],
    ["bulkScanReview", JSON.stringify([{ id: "pending-copy", matches }])],
  ]);
  const h = clientHarness("app/scan/page.tsx", { globals: { window: { location: { search: "?review=1" } }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }, extraModules: {
    "@/components/PiBulkScanner": { PiBulkScanner: "PiBulkScanner" }, "@/components/CardDiscovery": { CardDiscovery: "CardDiscovery" },
    "@/components/ScanLanguageBadge": { ScanLanguageBadge: "ScanLanguageBadge" }, "@/lib/scanner/use-scan-preparation": { useScanPreparation: () => () => {} },
  } });
  h.render(); await h.flush(); h.render(); await h.flush();
  const tree = h.render();
  const dialog = nodes(tree, n => n.props?.role === "dialog" && n.props["aria-label"] === "Scan results")[0];
  assert.match(text(dialog), /4 captured .* 2 identified .* 2 need retry/);
  assert.ok(dialog); assert.match(text(dialog), /1 ready to save · 1 need confirmation/);
  assert.equal(nodes(tree, n => n.type === "PiBulkScanner").length, 0);
  assert.equal(JSON.parse(storage.get("bulkQueue")).length, 1);
  assert.equal(JSON.parse(storage.get("bulkScanReview")).length, 1);
});

test("horizontal lighting bands do not look like a card or prevent stable placement detection", () => {
  const { StandDetector, frameDistance } = pure("lib/scanner/stand-detector.ts");
  const empty = new Float32Array(32 * 32 * 3).fill(100);
  const banded = (card, phase) => Float32Array.from(empty, (value, i) => {
    const pixel = Math.floor(i / 3), x = pixel % 32, y = Math.floor(pixel / 32);
    return value + (Math.floor((y + phase) / 3) % 2 ? 22 : -22) + (card ? (x % 4 < 2 ? 40 : -40) : 0);
  });
  assert.ok(frameDistance(empty, banded(false, 1)) < 1);
  const detector = new StandDetector(); detector.calibrate(empty);
  assert.equal(detector.observe(banded(false, 1)), "empty");
  assert.equal(detector.observe(banded(true, 1)), "settling");
  assert.equal(detector.observe(banded(true, 3)), "capture");
  assert.equal(detector.observe(banded(true, 2)), "unchanged");
  detector.observe(banded(false, 2)); detector.observe(banded(false, 4));
  detector.observe(banded(true, 2));
  assert.equal(detector.observe(banded(true, 4)), "capture");
});

test("Finish waits for the current identification and keeps its result before closing", async () => {
  const timers = new Map(); let release, closed = 0;
  const { h, props, accepted, button, click } = cameraHarness({ timers, match: () => new Promise(resolve => { release = resolve; }) });
  props.onClose = () => { closed++; };
  h.render(); await h.flush();
  await click("Connect Pi camera"); await click("Stand is empty — start automatic scanning");
  const [id, tick] = timers.entries().next().value; timers.delete(id); tick(); await settle();
  button("Finish scanning").props.onClick();
  assert.equal(closed, 0);
  release(matches); await settle();
  assert.equal(accepted.length, 1);
  assert.equal(closed, 1);
});

test("whole-card framing remains valid when horizontal lighting bands move", () => {
  const { framingIssue } = pure("lib/scanner/pi-framing.ts", { Uint8ClampedArray, Uint8Array });
  const width = 96, height = 64;
  function scene(card, phase) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const color = card && x >= 35 && x <= 60 && y >= 7 && y <= 56 ? [220, 120, 30] : [90, 90, 90];
      const band = Math.floor((y + phase) / 4) % 2 ? 22 : -22;
      pixels.set([...color.map(value => value + band), 255], (y * width + x) * 4);
    }
    return { width, height, pixels, aspect: 16 / 9 };
  }
  assert.equal(framingIssue(scene(true, 3), scene(false, 0), { x: 0.3, y: 0.06, width: 0.4, height: 0.88 }), undefined);
});


test("capture counts distinguish polling frames, retries, identified cards and failures", () => {
  const { PiScanCounter } = pure("lib/scanner/pi-progress.ts");
  const counter = new PiScanCounter();
  counter.start("a"); counter.failed("a"); counter.start("a"); counter.identified("a");
  counter.start("b"); counter.failed("b");
  assert.equal(counter.snapshot().captured, 2);
  assert.equal(counter.snapshot().identified, 1);
  assert.equal(counter.snapshot().failed, 1);
});

test("deferring an automatic match schedules the next capture instead of opening a blocking chooser", async () => {
  const timers = new Map();
  const { h, props, click } = cameraHarness({ timers, match: async () => matches });
  let reviews = 0;
  props.onMatches = () => { reviews++; return "review"; };
  h.render(); await h.flush();
  await click("Connect Pi camera"); await click("Stand is empty \u2014 start automatic scanning");
  for (let i = 0; i < 2; i++) {
    const [id, tick] = timers.entries().next().value; timers.delete(id); tick(); await settle();
    assert.match(text(h.render()), /Captured for review at the end/);
    assert.ok(timers.size > 0);
  }
  assert.equal(reviews, 2);
  await click("Stop automatic scanning");
});


test("four cards placed on top trigger once each without an empty stand between them", () => {
  const { StandDetector } = pure("lib/scanner/stand-detector.ts");
  const empty = new Float32Array(32 * 32 * 3).fill(100);
  const cards = [0, 1, 2, 3].map(phase => Float32Array.from(empty, (_, i) => {
    const x = Math.floor(i / 3) % 32;
    return 100 + ((x + phase) % 8 < 4 ? 45 : -45);
  }));
  const detector = new StandDetector(); detector.calibrate(empty);
  for (const card of cards) {
    assert.equal(detector.observe(card), "settling");
    assert.equal(detector.observe(card), "capture");
    for (let repeat = 0; repeat < 6; repeat++) assert.equal(detector.observe(card), "unchanged");
  }
});

test("a passing hand and lighting drift do not requeue an unchanged top card", () => {
  const { StandDetector } = pure("lib/scanner/stand-detector.ts");
  const empty = new Float32Array(32 * 32 * 3).fill(100);
  const card = Float32Array.from(empty, (_, i) => 100 + (Math.floor(i / 3) % 8 < 4 ? 45 : -45));
  const hand = Float32Array.from(empty, (_, i) => 100 + (Math.floor(i / 3) % 5 < 2 ? 65 : -65));
  const detector = new StandDetector(); detector.calibrate(empty);
  detector.observe(card); assert.equal(detector.observe(card), "capture");
  assert.equal(detector.observe(hand), "settling");
  assert.equal(detector.observe(card), "unchanged");
  const lit = Float32Array.from(card, (value, i) => value + (Math.floor(i / 96) % 2 ? 10 : -10));
  assert.equal(detector.observe(lit), "unchanged");
  detector.requestNextCopy();
  assert.equal(detector.observe(card), "settling");
  assert.equal(detector.observe(card), "capture");
  assert.equal(detector.observe(card), "unchanged");
});


test("the identical-copy control rearms a held stack without stopping automatic scanning", async () => {
  const timers = new Map(); let requested = 0;
  const { h, click } = cameraHarness({ timers, match: async () => matches,
    detector: class { calibrate() {} observe() { return "unchanged"; } requestNextCopy() { requested++; } } });
  h.render(); await h.flush();
  await click("Connect Pi camera"); await click("Stand is empty \u2014 start automatic scanning");
  await click("Scan identical copy");
  assert.equal(requested, 1);
  assert.ok(nodes(h.render(), n => text(n) === "Stop automatic scanning" && n.props?.onClick).length);
  assert.doesNotMatch(text(h.render()), /Remove the scanned card/);
  await click("Stop automatic scanning");
});
