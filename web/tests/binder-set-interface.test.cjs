/* eslint-disable @typescript-eslint/no-require-imports -- Render real client handlers with isolated fixtures. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clientHarness, nodes, text } = require("./client-harness.cjs");
const set = { id: "pokemon:123:eng", tcg: "pokemon", code: "SVI", name: "Scarlet & Violet", language: "eng", total: 2, owned: 1, catalogComplete: false };
const extraModules = { "@/components/PriceAlertControl": { PriceAlertControl: "PriceAlertControl" }, "@/components/MissingSetAlerts": { MissingSetAlerts: "MissingSetAlerts" } };
test("My sets filters owned numeric IDs by set name and retains binder scope", async () => {
  const requests = [];
  const h = clientHarness("components/SetBrowser.tsx", { exportName: "SetBrowser", props: { ownedOnly: true, binderId: 7 }, fetch: async url => {
    requests.push(url);
    return { ok: true, json: async () => ({ sets: [set, { ...set, id: "other", name: "Unowned", owned: 0 }] }) };
  } });
  h.render(); await h.flush();
  let tree = h.render();
  assert.ok(requests[0].includes("binderId=7"));
  assert.match(text(tree), /Scarlet & Violet/);
  assert.equal(text(tree).includes("Unowned"), false);
  assert.ok(nodes(tree, n => n.type === "a" && n.props.href.includes("binderId=7"))[0]);
  const search = nodes(tree, n => n.type === "input")[0];
  search.props.onChange({ target: { value: "scarlet" } }); assert.match(text(h.render()), /Scarlet & Violet/);
  search.props.onChange({ target: { value: "missing name" } }); assert.match(text(h.render()), /No sets match this name/);
});
test("binder hub exposes My sets scoped to the selected binder", async () => {
  const h = clientHarness("app/portfolios/page.tsx", { query: new URLSearchParams("view=sets&binderId=7"), fetch: async () => ({ ok: true, json: async () => ({ portfolios: [{ id: 7, name: "Favorites" }], all: {}, currency: "USD" }) }) });
  h.render(); await h.flush(); const tree = h.render();
  const browser = nodes(tree, n => n.type?.name === "SetBrowser")[0];
  assert.equal(browser.props.binderId, 7); assert.equal(browser.props.ownedOnly, true);
  assert.match(text(tree), /All binders.*Favorites/);
});
test("set detail shows scoped missing singles, search, and price alert controls", async () => {
  const requests = [];
  const prices = { tcgplayer: { currency: "USD", variants: { normal: { market: 2 } } } };
  const cards = [{ id: "tp:1", name: "Owned", cardNumber: "1", owned: 1, price: 2, priceVariant: "normal", prices }, { id: "tp:2", name: "Missing", cardNumber: "2", owned: 0, price: 2, priceVariant: "normal", prices }];
  const h = clientHarness("app/sets/[id]/page.tsx", { params: { id: set.id }, extraModules, query: new URLSearchParams("view=my-sets&binderId=7"), fetch: async url => {
    requests.push(url); return { ok: true, json: async () => url.startsWith("/api/sets/") ? { set, cards, currency: "USD", completion: { owned: 1, total: 2, pct: 50, missingCost: 2, totalValue: 4, unpricedMissing: 0, catalogComplete: false, catalogTotal: 198 } } : {} };
  } });
  h.render(); await h.flush(); let tree = h.render();
  assert.ok(requests.some(url => url.includes("binderId=7")));
  assert.match(text(tree), /Imported checklist.*this binder/);
  assert.equal(nodes(tree, n => n.type === "MissingSetAlerts")[0].props.cards.length, 1);
  nodes(tree, n => n.type?.name === "Segmented" && n.props.value === "all")[0].props.onChange("missing");
  tree = h.render(); assert.equal(nodes(tree, n => n.type === "PriceAlertControl").length, 1);
  assert.equal(nodes(tree, n => n.type === "PriceAlertControl")[0].props.cardId, "tp:2");
  nodes(tree, n => n.type === "input")[0].props.onChange({ target: { value: "not present" } });
  assert.match(text(h.render()), /No cards match/);
});
test("bulk missing alerts preserve existing watches, skip missing finishes, and report failures", async () => {
  const calls = []; const prices = { tcgplayer: { currency: "USD", variants: { normal: { market: 2 } } } };
  const h = clientHarness("components/MissingSetAlerts.tsx", { exportName: "MissingSetAlerts", props: { cards: [] }, fetch: async (url, options) => {
    if (!options) return { ok: true, json: async () => ({ alerts: [{ card: { id: "existing" } }] }) };
    const body = JSON.parse(options.body); calls.push(body);
    return { ok: body.cardId !== "failure" };
  } });
  const result = await h.exports.watchMissingSingles([{ id: "existing", prices }, { id: "new", prices }, { id: "unpriced", prices: { tcgplayer: { currency: "USD", variants: { holofoil: { market: 200 } } } } }, { id: "failure", prices }], "normal", "drop", 12);
  assert.equal(JSON.stringify(result), JSON.stringify({ saved: 1, existing: 1, unpriced: 1, failed: 1 }));
  assert.deepEqual(calls.map(call => call.cardId), ["new", "failure"]);
  assert.ok(calls.every(call => call.variantType === "normal" && call.direction === "drop" && call.thresholdPct === 12));
});
test("Home exposes edit/remove controls for every watch through Show all alerts", async () => {
  const alerts = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, card: { id: "tp:" + i, name: "Watch " + i }, variantType: "normal", direction: "drop", thresholdPct: 12, basePrice: 10, baseCurrency: "USD", currentPrice: 10, currency: "USD", changePct: 0, triggered: i < 4 }));
  const dashboard = { summary: { uniqueCount: 1, itemCount: 1, value: 10, cost: 0, gain: 10 }, currency: "USD", series: [], trending: [{ id: 1, cardId: "tp:1", name: "Mover", value: 10 }], mostValuable: [], biggestGains: [], biggestLosses: [], stats: { setsStarted: 0, topTcg: null, topTcgByValue: null } };
  const h = clientHarness("app/page.tsx", { extraModules, fetch: async url => ({ ok: true, json: async () => url.startsWith("/api/alerts") ? { alerts } : dashboard }) });
  h.render(); await h.flush(); let tree = h.render();
  assert.equal(nodes(tree, n => n.type === "PriceAlertControl").length, 7);
  nodes(tree, n => n.type === "button" && text(n).startsWith("Show all alerts"))[0].props.onClick();
  tree = h.render();
  assert.equal(nodes(tree, n => n.type === "PriceAlertControl").length, 9);
  assert.ok(nodes(tree, n => n.type === "PriceAlertControl").every(n => n.props.initialAlert.direction === "drop"));
});
