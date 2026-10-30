/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the scan-to-catalog handoff with isolated fixtures. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const exports = {};
  const filename = path.join(__dirname, '../src', file);
  if (!fs.existsSync(filename)) return exports;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, process: { env: { NODE_ENV: 'test' } }, require: (name) => {
    if (name in dependencies) return dependencies[name];
    if (name === '@/lib/types') return load('lib/types.ts');
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
const scan = { id: 'tcgdex:en:base1-4', name: 'Charizard', set: 'base1', setName: 'Base Set', num: '4', tcg: 'pokemon', lang: 'en' };
const card = { id: 'tp:123', name: 'Charizard', setCode: 'base1', setName: 'Base Set', cardNumber: '4/102', tcg: 'pokemon', language: 'eng', prices: { tcgplayer: { currency: 'USD', variants: { holofoil: { market: 100 } } } } };

test('photo matches resolve to a real catalog card with source prices, without portfolio writes', async () => {
  const calls = [];
  const { lookupShowCard } = load('lib/card-show-catalog.ts', {
    '@/lib/cards': { getCard: async () => { throw new Error('Use index resolver'); } },
    '@/lib/resolve': { resolveScanId: async (id) => { calls.push(id); return { card }; } },
    '@/lib/scanner/matcher': { isScanIndexId: (id) => id.startsWith('tcgdex:') },
    '@/lib/card-show-local-catalog': { localShowCard: async () => { throw new Error('Not needed'); } },
  });
  assert.equal(typeof lookupShowCard, 'function');
  const result = await lookupShowCard(scan.id);
  assert.equal(result.card.id, 'tp:123');
  assert.equal(result.card.prices.tcgplayer.variants.holofoil.market, 100);
  assert.equal(result.warning, null);
  assert.deepEqual(calls, [scan.id]);
});

test('catalog failure can use a saved local price and identifies it as a snapshot', async () => {
  const { lookupShowCard } = load('lib/card-show-catalog.ts', {
    '@/lib/cards': { getCard: async () => { throw new Error('Database offline'); } },
    '@/lib/resolve': { resolveScanId: async () => { throw new Error('Database offline'); } },
    '@/lib/scanner/matcher': { isScanIndexId: () => false },
    '@/lib/card-show-local-catalog': { localShowCard: async (id) => id === card.id ? card : null },
  });
  assert.equal(typeof lookupShowCard, 'function');
  const result = await lookupShowCard(card.id);
  assert.equal(result.card.id, card.id);
  assert.match(result.warning, /saved|snapshot/i);
  assert.equal(await lookupShowCard('tp:missing'), null);
});

test('local catalog matching requires the exact game, language, set and collector number, and declines ambiguity', () => {
  const { chooseLocalPrinting } = load('lib/card-show-printing.ts');
  assert.equal(typeof chooseLocalPrinting, 'function');
  assert.equal(chooseLocalPrinting([card], scan).id, card.id);
  for (const change of [{ cardNumber: '40/102' }, { setCode: 'base2', setName: 'Base Set 2' }, { language: 'jap' }, { tcg: 'mtg' }]) assert.equal(chooseLocalPrinting([{ ...card, ...change }], scan), null);
  assert.equal(chooseLocalPrinting([card, { ...card, id: 'tp:other' }], scan), null);
  assert.equal(chooseLocalPrinting([{ ...card, cardNumber: '004/102' }], scan).id, card.id);
});

test('the saved local catalog is never opened outside development', async () => {
  const unused = () => { throw new Error('Local snapshot must not be accessed'); };
  const { localShowCard } = load('lib/card-show-local-catalog.ts', {
    'node:fs': { existsSync: unused }, 'node:module': { createRequire: unused }, 'node:path': { join: unused },
    '@/lib/model-index': { indexCard: unused }, '@/lib/card-show-printing': { chooseLocalPrinting: unused },
  });
  assert.equal(await localShowCard('tp:123'), null);
});
