/* eslint-disable @typescript-eslint/no-require-imports -- Isolate public API boundaries from account/database services. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const zod = require('zod');
function load(file, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, URL, Date, process: { env: {} }, console: { error() {} }, require: (name) => {
    if (name in modules) return modules[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
const types = load('lib/types.ts', {});
const cash = load('lib/card-show.ts', {});
const investing = load('lib/investing.ts', { './card-show': cash });
const now = Date.now(), date = (days) => new Date(now - days * 86400000).toISOString().slice(0, 10);
const card = (id, amount, language = 'eng') => ({ key: id, id, name: 'Pikachu', language, setName: '151', cardNumber: '25', imageUrl: null,
  analysis: investing.analyzeMarket({ source: 'tcgplayer', variant: 'normal', amount, currency: 'USD', updatedAt: new Date(now).toISOString(), metric: 'market' },
    [7, 30, 35, 40, 45].map((days) => ({ date: date(days), variantType: 'normal', tcgplayerMarket: 100, cardmarketAvg: null })), now) });
function marketHarness(rows = [], failure = false) {
  let reads = 0;
  const endpoint = load('app/api/investing/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    zod, '@/lib/types': types, '@/lib/investing': investing, '@/lib/card-show': cash,
    '@/lib/currency': { getRates: async () => ({ base: 'USD', date: date(0), rates: { USD: 1, CAD: 1.4 } }) },
    '@/lib/investing-catalog': { getMarketCatalog: async () => { reads++; if (failure) throw new Error('db secret should not leak'); return rows; } },
  });
  return { get: (query = '') => endpoint.GET({ nextUrl: new URL('http://localhost/api/investing?' + query) }), reads: () => reads };
}
test('public market API validates filters before reading any catalog data', async () => {
  const h = marketHarness();
  for (const query of ['source=unknown', 'days=1', 'currency=ZZZ', 'min=-1', 'min=NaN', 'min=20&max=10', 'limit=61', 'language=private']) {
    assert.equal((await h.get(query)).status, 400, query);
  }
  assert.equal(h.reads(), 0);
});
test('market API filters in display currency then ranks across all catalog cards before limiting', async () => {
  const rows = Array.from({ length: 35 }, (_, i) => card(`tp:${i}`, 101 + i, i === 34 ? 'jap' : 'eng'));
  const h = marketHarness(rows);
  const result = await h.get('currency=CAD&min=140&max=190&days=7&language=eng&limit=2&q=151');
  assert.equal(result.status, 200);
  assert.equal(result.body.catalogCount, 35);
  assert.equal(result.body.filteredCount, 34);
  assert.equal(result.body.freshCount, 34);
  assert.equal(result.body.lists.gainers.length, 2);
  assert.equal(result.body.lists.gainers[0].id, 'tp:33');
  assert.equal(result.body.counts.gainers, 34);
  assert.ok(result.body.lists.caution.length);
});
test('empty market returns empty lists and failures expose no internal errors', async () => {
  assert.equal((await marketHarness().get()).body.catalogCount, 0);
  const result = await marketHarness([], true).get();
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result.body), /secret/);
});
test('single-card endpoint validates IDs and handles unavailable history', async () => {
  let reads = 0;
  const endpoint = load('app/api/investing/card/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } }, zod,
    '@/lib/investing-catalog': { getInvestingCard: async (id) => { reads++; return id === 'tp:1' ? { card: { id }, history: [], analyses: [] } : null; } },
  });
  const get = (id) => endpoint.GET({ nextUrl: new URL(`http://localhost/api/investing/card?id=${encodeURIComponent(id)}`) });
  assert.equal((await get('../../secret')).status, 400);
  assert.equal(reads, 0);
  assert.equal((await get('tp:1')).status, 200);
  assert.equal((await get('tp:2')).status, 404);
});
test('new public routes do not permit private siblings or private account pages', () => {
  const config = load('lib/auth.config.ts', { 'next-auth/providers/google': { __esModule: true, default: (options) => options } }).default;
  const allowed = (pathname) => config.callbacks.authorized({ auth: null, request: { nextUrl: new URL('http://localhost' + pathname) } });
  for (const route of ['/investing', '/api/investing', '/api/investing/card', '/cards', '/sets']) assert.equal(allowed(route), true, route);
  for (const route of ['/investing/private', '/api/investing/private', '/cards/private', '/settings', '/portfolios']) assert.equal(allowed(route), false, route);
});
