/* eslint-disable @typescript-eslint/no-require-imports -- Exercise browser event handlers in the Node harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clientHarness, nodes, text } = require("./client-harness.cjs");

test("Pi capture validates the sender, identifies a crop and allows retry after matching fails", async () => {
  const popup = { closed: false, close() {} };
  let listener, opened, calls = 0, accepted;
  const props = { paused: false, count: 2, tcg: "pokemon", lang: "eng", onClose() {}, onMatches: m => { accepted = m; } };
  const matches = [{ card: { id: "test" }, score: 0.95 }];
  const h = clientHarness("components/PiBulkScanner.tsx", {
    props, exportName: "PiBulkScanner",
    globals: {
      ArrayBuffer, Uint8Array, Blob, Error,
      crypto: { randomUUID: () => "12345678-1234-1234-1234-123456789abc" },
      URL: class extends URL { static createObjectURL() { return "blob:photo"; } static revokeObjectURL() {} },
      window: { location: { origin: "https://app.example" }, open: url => { opened = url; return popup; }, addEventListener: (_, fn) => { listener = fn; }, removeEventListener() {} },
      createImageBitmap: async () => ({ width: 1000, height: 600, close() {} }),
      document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({}) }) }) },
    },
    extraModules: {
      "@/lib/grading/analysis": { suggestCardCrop: () => ({ x: 0.2, y: 0.1, width: 0.5, height: 0.8 }) },
      "@/lib/scanner/preprocess": { preprocess: (_, crop) => { assert.equal(crop.w, 500); return new Float32Array(1); } },
      "@/lib/scanner/engine": { getScanEngine: async () => ({ status: "ready", match: async (_, k, tcg, lang) => { assert.equal(tcg, "pokemon"); assert.equal(lang, "eng"); if (++calls === 1) throw new Error("Connection failed"); return matches; } }) },
    },
  });
  const button = label => nodes(h.render(), n => text(n) === label && typeof n.props?.onClick === "function")[0];
  h.render(); await h.flush();
  button("Open Pi camera").props.onClick();
  const session = new URL(opened).searchParams.get("session");
  const event = { source: popup, origin: "http://10.12.194.1:8000", data: { type: "rnp-photo", session, side: "front", bytes: Uint8Array.of(255,216,255,217).buffer } };
  await listener({ ...event, origin: "https://evil.example" });
  assert.equal(nodes(h.render(), n => n.type === "img").length, 0);
  await listener(event);
  assert.equal(nodes(h.render(), n => n.type === "img").length, 1);
  await button("Identify card").props.onClick();
  await new Promise(setImmediate);
  assert.match(text(h.render()), /Connection failed/);
  await button("Identify card").props.onClick();
  await new Promise(setImmediate);
  assert.equal(accepted, matches);
  props.paused = true; h.render(); await h.flush();
  await listener(event);
  assert.equal(nodes(h.render(), n => n.type === "img").length, 0);
  assert.equal(button("Open Pi camera").props.disabled, true);
});

test("Pi bulk entry uses the existing match chooser and queue without opening the regular camera", async () => {
  const h = clientHarness("app/scan/page.tsx", { globals: { window: { location: { search: "?camera=pi" } }, localStorage: { getItem: () => null, setItem() {} } }, extraModules: {
    "@/components/PiBulkScanner": { PiBulkScanner: "PiBulkScanner" },
    "@/components/CardDiscovery": { CardDiscovery: "CardDiscovery" },
    "@/components/ScanLanguageBadge": { ScanLanguageBadge: "ScanLanguageBadge" },
    "@/lib/scanner/use-scan-preparation": { useScanPreparation: () => () => {} },
  }, fetch: async url => ({ ok: true, json: async () => url.includes("/api/cards/") ? { card: { id: "card1", name: "Card one" } } : { portfolios: [] } }) });
  let tree = h.render(); await h.flush();
  assert.equal(nodes(tree, n => text(n) === "Pi bulk scan" && n.props?.href)[0].props.href, "/scan?camera=pi");
  tree = h.render();
  assert.equal(nodes(tree, n => n.type === "Scanner").length, 0);
  let pi = nodes(tree, n => n.type === "PiBulkScanner")[0];
  pi.props.onMatches([{ card: { id: "card1", name: "Card one", tcg: "pokemon" }, score: 0.95 }]);
  tree = h.render();
  const choose = nodes(tree, n => n.type === "button" && text(n).includes("Card one"))[0];
  await choose.props.onClick();
  tree = h.render();
  pi = nodes(tree, n => n.type === "PiBulkScanner")[0];
  assert.equal(pi.props.count, 1);
  pi.props.onClose();
  assert.match(text(h.render()), /Scanned cards \(1\)/);
});
