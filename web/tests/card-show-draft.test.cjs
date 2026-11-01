/* eslint-disable @typescript-eslint/no-require-imports -- Exercise saved draft validation and conversion without a browser. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const exports = {};
  cache.set(relative, exports);
  const file = path.join(__dirname, '../src', relative);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, crypto,
    require: (name) => name.startsWith('@/') ? load(`${name.slice(2)}.ts`) : require(name),
  });
  return exports;
}
const { createDraft, readDraft, changeCurrency, catalogCard, startOfferCheck } = load('components/card-show/draft.ts');
const fx = { base: 'USD', date: 'fixture', rates: { USD: 1, CAD: 1.4, EUR: 0.9 } };

test('drafts restore all modes and reject corrupt or unsafe saved values', () => {
  const draft = createDraft('CAD');
  assert.equal(readDraft(JSON.stringify(draft)).currency, 'CAD');
  assert.equal(readDraft(JSON.stringify(draft)).giving.rate, '100');
  for (const raw of [null, '', '{', '{}', JSON.stringify({ ...draft, currency: 'FAKE' }), JSON.stringify({ ...draft, giving: { cards: [{}], cash: '', rate: '100' } })]) assert.equal(readDraft(raw), null);
  assert.equal(readDraft('x'.repeat(1_000_001)), null);
});
test('switching deal currency converts each entered cash value while keeping card references in native currency', () => {
  const draft = createDraft('USD');
  draft.buy.cash = '75'; draft.sell.cash = '90'; draft.giving.cash = '20';
  const converted = changeCurrency(draft, 'CAD', fx);
  assert.equal(converted.buy.cash, '105.00');
  assert.equal(converted.sell.cash, '126.00');
  assert.equal(converted.giving.cash, '28.00');
  assert.equal(converted.getting.cash, '');
  assert.equal(draft.buy.cash, '75');
  assert.equal(draft.currency, 'USD');
  draft.buy.cash = '-1';
  assert.equal(changeCurrency(draft, 'CAD', fx), null);
  draft.buy.cash = '75';
  assert.equal(changeCurrency(draft, 'JPY', fx), null);
});
test('catalog references retain each variant, currency, price metric and update date', () => {
  const card = catalogCard({ id: 'tp:test', name: 'Charizard', language: 'jap', setName: '151', cardNumber: '199', prices: {
    tcgplayer: { currency: 'USD', updatedAt: '2026-10-29', variants: { holofoil: { market: 100 }, reverseHolofoil: { market: null, low: 50 } } },
    cardmarket: { currency: 'EUR', updatedAt: '2026-10-28', variants: { normal: { trend: 90 } } },
  } });
  assert.equal(card.options.length, 3);
  assert.equal(card.options[0].updatedAt, '2026-10-29');
  assert.equal(card.options[1].value, '50.00');
  assert.ok(card.options[1].label.endsWith('low'));
  assert.equal(card.options[2].currency, 'EUR');
  assert.equal(card.value, '100.00');
  assert.equal(card.custom, false);
  assert.ok(card.detail.includes('Japanese'));
  assert.notEqual(catalogCard({ ...card, prices: {} }).key, card.key);
});
test('unpriced cards remain incomplete until a user provides a positive value', () => {
  const card = catalogCard({ id: 'tp:none', name: 'Unpriced', language: 'eng', prices: {} });
  assert.equal(card.value, '');
  assert.equal(card.custom, true);
});

function pricedCard(id, amount) {
  return catalogCard({ id, name: id, language: 'eng', prices: { tcgplayer: { currency: 'USD', variants: { normal: { market: amount } } } } });
}
test('checking an offer focuses one card instead of mixing it into a saved buying bundle', () => {
  assert.equal(typeof startOfferCheck, 'function');
  const original = createDraft('CAD');
  original.buy.cards = [pricedCard('tp:old1', 100), pricedCard('tp:old2', 50)];
  original.buy.cash = '140'; original.target = '75'; original.mode = 'trade';
  original.giving.cash = '20';
  const selected = startOfferCheck(original, pricedCard('tp:new', 25));
  assert.equal(selected.mode, 'buy');
  assert.equal(selected.buy.cards.length, 1);
  assert.equal(selected.buy.cards[0].id, 'tp:new');
  assert.equal(selected.buy.cash, '');
  assert.equal(selected.offerBackup.buy.cash, '140');
  assert.equal(selected.offerBackup.buy.cards.length, 2);
  assert.equal(selected.offerBackup.mode, 'trade');
  assert.equal(selected.offerBackup.currency, 'CAD');
  assert.equal(selected.giving.cash, '20');
  assert.equal(original.buy.cards.length, 2, 'the original bundle is not mutated');
});
test('successive offer checks retain the original draft and clear the old asking price', () => {
  assert.equal(typeof startOfferCheck, 'function');
  const original = createDraft('USD');
  original.buy.cards = [pricedCard('tp:original', 100)]; original.buy.cash = '75';
  const first = startOfferCheck(original, pricedCard('tp:first', 25));
  first.buy.cash = '20'; first.buy.cards[0].quantity = 3;
  const second = startOfferCheck(first, pricedCard('tp:second', 50));
  assert.equal(second.buy.cards.length, 1);
  assert.equal(second.buy.cards[0].id, 'tp:second');
  assert.equal(second.buy.cards[0].quantity, 1);
  assert.equal(second.buy.cash, '');
  assert.equal(second.offerBackup.buy.cards[0].id, 'tp:original');
  assert.equal(second.offerBackup.buy.cash, '75');
  assert.equal(second.offerBackup.offerBackup, undefined, 'backups never nest');
});
test('the previous deal survives reload and remains in its own currency after offer conversion', () => {
  assert.equal(typeof startOfferCheck, 'function');
  const original = createDraft('USD');
  original.buy.cards = [pricedCard('tp:original', 100)]; original.buy.cash = '75'; original.target = '70';
  const focused = startOfferCheck(original, pricedCard('tp:new', 50));
  focused.buy.cash = '35';
  const converted = changeCurrency(focused, 'CAD', fx);
  const restored = readDraft(JSON.stringify(converted));
  assert.equal(restored.currency, 'CAD');
  assert.equal(restored.buy.cash, '49.00');
  assert.equal(restored.offerBackup.currency, 'USD');
  assert.equal(restored.offerBackup.buy.cash, '75');
  assert.equal(restored.offerBackup.target, '70');
  assert.equal(readDraft(JSON.stringify({ ...focused, offerBackup: { broken: true } })), null);
});
