/* eslint-disable @typescript-eslint/no-require-imports -- Exercise pure TypeScript with the repository's Node test runner. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const modules = {};
function load(relative) {
  if (modules[relative]) return modules[relative];
  const exports = {}; modules[relative] = exports;
  const file = path.join(__dirname, '../src/lib', relative + '.ts');
  if (fs.existsSync(file)) vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, require: (name) => load(name.replace(/^\.\//, '')) });
  return exports;
}
const api = load('investing');
const now = Date.parse('2026-11-01T12:00:00Z');
const row = (date, value, variantType = 'holofoil') => ({ date, variantType, tcgplayerMarket: value, cardmarketAvg: value * 0.8 });
const history = [row('2026-09-30', 95), row('2026-10-05', 96), row('2026-10-12', 98), row('2026-10-20', 99), row('2026-10-25', 100), row('2026-10-31', 104)];
const reference = { source: 'tcgplayer', variant: 'holofoil', amount: 105, currency: 'USD', updatedAt: '2026-11-01T07:00:00Z', metric: 'market' };
const analyze = (patch = {}, rows = history) => api.analyzeMarket({ ...reference, ...patch }, rows, now);
const offer = (patch = {}) => api.assessOffer({ analysis: analyze(), asking: '80', quantity: 1, currency: 'USD', fx: { date: '2026-10-30', rates: { USD: 1, CAD: 1.4 } }, target: '80', confirmed: true, custom: false, ...patch });

test('market analysis uses only the exact variant and source', () => {
  assert.equal(typeof api.analyzeMarket, 'function');
  const result = analyze({}, [...history, row('2026-10-25', 1, 'reverseHolofoil')]);
  assert.ok(Math.abs(result.changes[7].percent - 5) < 0.0001);
  assert.equal(result.changes[7].date, '2026-10-25');
  assert.ok(Math.abs(analyze({ source: 'cardmarket', currency: 'EUR', amount: 84 }).changes[7].percent - 5) < 0.0001);
});
test('periods require actual baselines within six days; invalid and future observations are excluded', () => {
  assert.equal(typeof api.analyzeMarket, 'function');
  const result = analyze({}, [row('2026-10-15', 50), row('2026-10-26', 99), row('2026-11-02', 1), row('bad', 1), row('2026-10-25', 0), row('2026-10-25', NaN)]);
  assert.equal(result.changes[7], null);
  assert.equal(result.changes[30], null);
  assert.equal(result.samples, 2);
  assert.equal(result.research, false);
});
test('sharp rises and declines block a research recommendation', () => {
  assert.equal(typeof api.analyzeMarket, 'function');
  assert.ok(analyze({ amount: 130 }).flags.some((flag) => flag.code === 'spike'));
  assert.ok(analyze({ amount: 80 }).flags.some((flag) => flag.code === 'decline'));
  assert.equal(analyze({ amount: 130 }).research, false);
  assert.equal(analyze().research, true);
});
test('stale, missing-date, future and invalid current references cannot produce positive signals', () => {
  assert.equal(typeof api.analyzeMarket, 'function');
  for (const patch of [{ updatedAt: '2026-10-20' }, { updatedAt: null }, { updatedAt: '2026-11-02' }, { amount: 0 }, { amount: Infinity }]) {
    assert.equal(analyze(patch).research, false, JSON.stringify(patch));
    assert.notEqual(offer({ analysis: analyze(patch) }).verdict, 'good');
  }
});
test('good buy depends on the actual asking price, user target and condition confirmation', () => {
  assert.equal(typeof api.assessOffer, 'function');
  assert.equal(offer().verdict, 'good');
  assert.equal(offer({ asking: '100' }).verdict, 'negotiate');
  assert.equal(offer({ asking: '110' }).verdict, 'pass');
  assert.equal(offer({ asking: '80', target: '70' }).verdict, 'negotiate');
  assert.equal(offer({ confirmed: false }).verdict, 'check');
  assert.equal(offer({ custom: true }).verdict, 'check');
  assert.equal(offer({ analysis: analyze({ amount: 130 }) }).verdict, 'check');
});
test('asking price is per bundle, quantities and currency are handled before comparison', () => {
  assert.equal(typeof api.assessOffer, 'function');
  const result = offer({ asking: '224', quantity: 2, currency: 'CAD' });
  assert.equal(result.unitAsking, 112);
  assert.equal(result.market, 147);
  assert.equal(result.verdict, 'good');
  assert.equal(offer({ currency: 'JPY' }).verdict, 'check');
  assert.equal(offer({ currency: 'CAD', fx: { date: 'fallback', rates: { USD: 1, CAD: 1.4 } } }).verdict, 'check');
});
test('invalid offers and targets never yield a good buy', () => {
  assert.equal(typeof api.assessOffer, 'function');
  for (const asking of ['', '0', '-1', 'NaN', '1e2', '1.001']) assert.equal(offer({ asking }).verdict, 'check', asking);
  for (const quantity of [0, -1, 1.5, 1000]) assert.equal(offer({ quantity }).verdict, 'check');
  for (const target of ['0', '101', '', 'bad']) assert.equal(offer({ target }).verdict, 'check');
});
test('market lists rank the full supplied catalog and exclude stale/unknown period movements', () => {
  assert.equal(typeof api.screenMarket, 'function');
  const cards = [
    { key: 'steady', analysis: analyze() },
    { key: 'spike', analysis: analyze({ amount: 130 }) },
    { key: 'fall', analysis: analyze({ amount: 80 }) },
    { key: 'stale', analysis: analyze({ amount: 500, updatedAt: '2026-10-01' }) },
  ];
  const result = api.screenMarket(cards, 7);
  assert.equal(result.gainers[0].key, 'spike');
  assert.equal(result.decliners[0].key, 'fall');
  assert.deepEqual(Array.from(result.research, (c) => c.key), ['steady']);
  assert.ok(result.caution.some((c) => c.key === 'fall'));
  assert.equal(result.gainers.some((c) => c.key === 'stale'), false);
});
