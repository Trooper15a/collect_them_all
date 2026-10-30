/* eslint-disable @typescript-eslint/no-require-imports -- Run pure TypeScript valuation helpers with Node's test runner. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
const file = path.join(__dirname, '../src/lib/card-show.ts');
if (fs.existsSync(file)) vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });
const { parseAmount, exchange, totalCards, evaluateCash, evaluateTrade } = exportsObject;
const fx = { rates: { USD: 1, CAD: 1.4, EUR: 0.9 } };

test('money inputs distinguish missing, zero and invalid values', () => {
  assert.equal(typeof parseAmount, 'function');
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('0'), 0);
  for (const value of ['-1', 'Infinity', 'NaN', '1e3', '1.001', '  ', '1000000001']) assert.equal(parseAmount(value), null, value);
  assert.equal(parseAmount('12.50'), 12.5);
});
test('mixed currencies convert before totaling, with no missing-rate guess', () => {
  assert.equal(typeof exchange, 'function');
  assert.equal(exchange(100, 'USD', 'CAD', fx), 140);
  assert.equal(exchange(100, 'EUR', 'CAD', fx), 155.56);
  assert.equal(exchange(100, 'JPY', 'CAD', fx), null);
  assert.equal(totalCards([{ value: '100', currency: 'USD', quantity: 2 }, { value: '90', currency: 'EUR', quantity: 1 }], 'CAD', fx), 420);
});
test('unpriced, empty or invalid baskets never produce a misleading total', () => {
  assert.equal(typeof totalCards, 'function');
  assert.equal(totalCards([], 'USD', fx), null);
  for (const value of ['', '0', '-1', 'NaN']) assert.equal(totalCards([{ value, currency: 'USD', quantity: 1 }], 'USD', fx), null);
  for (const quantity of [0, -1, 1.5, 1000]) assert.equal(totalCards([{ value: '100', currency: 'USD', quantity }], 'USD', fx), null);
});
test('buying compares an asking price to the chosen target and shows 70–90% benchmarks', () => {
  assert.equal(typeof evaluateCash, 'function');
  const result = evaluateCash(100, '75', '80', 'buy');
  assert.equal(result.percent, 75);
  assert.equal(result.target, 80);
  assert.equal(result.advantage, 5);
  assert.equal(result.tone, 'good');
  assert.equal(result.low, 70);
  assert.equal(result.high, 90);
  assert.equal(evaluateCash(100, '95', '80', 'buy').tone, 'bad');
});
test('selling reverses the benefit direction and does not call a 70% offer an 80% deal', () => {
  assert.equal(typeof evaluateCash, 'function');
  assert.equal(evaluateCash(100, '70', '80', 'sell').advantage, -10);
  assert.equal(evaluateCash(100, '70', '80', 'sell').tone, 'caution');
  assert.equal(evaluateCash(100, '90', '80', 'sell').tone, 'good');
  assert.equal(evaluateCash(100, '65', '80', 'sell').tone, 'bad');
  assert.equal(evaluateCash(100, '100', '80', 'sell').tone, 'good');
});
test('cash comparisons reject incomplete values and allow an explicit zero offer', () => {
  assert.equal(typeof evaluateCash, 'function');
  for (const value of [null, 0, -1, Infinity]) assert.equal(evaluateCash(value, '80', '80', 'buy'), null);
  assert.equal(evaluateCash(100, '', '80', 'buy'), null);
  assert.equal(evaluateCash(100, '80', '0', 'buy'), null);
  assert.equal(evaluateCash(100, '80', '101', 'buy'), null);
  assert.equal(evaluateCash(100, '0', '80', 'sell').percent, 0);
});
test('trade defaults use full market values and include cash at face value', () => {
  assert.equal(typeof evaluateTrade, 'function');
  const result = evaluateTrade(100, 120, '0', '0', '100', '100');
  assert.equal(result.market.difference, 20);
  assert.equal(result.market.verdict, 'ahead');
  assert.equal(result.negotiated.difference, 20);
  const balanced = evaluateTrade(100, 120, '20', '', '100', '100');
  assert.equal(balanced.market.difference, 0);
  assert.equal(balanced.market.verdict, 'balanced');
});
test('vendor haircuts cannot hide a market-value loss, and cash is never discounted', () => {
  assert.equal(typeof evaluateTrade, 'function');
  const result = evaluateTrade(100, 80, '20', '20', '80', '100');
  assert.equal(result.market.difference, -20);
  assert.equal(result.market.verdict, 'behind');
  assert.equal(result.negotiated.giving, 100);
  assert.equal(result.negotiated.getting, 100);
  assert.equal(result.negotiated.verdict, 'balanced');
});
test('trade fairness tolerance is symmetric and missing/invalid inputs have no verdict', () => {
  assert.equal(typeof evaluateTrade, 'function');
  assert.equal(evaluateTrade(100, 95, '', '', '100', '100').market.verdict, 'balanced');
  assert.equal(evaluateTrade(95, 100, '', '', '100', '100').market.verdict, 'balanced');
  assert.equal(evaluateTrade(null, 100, '', '', '100', '100'), null);
  assert.equal(evaluateTrade(100, 100, '-1', '', '100', '100'), null);
  assert.equal(evaluateTrade(100, 100, '', '', '', '100'), null);
  assert.equal(evaluateTrade(100, 100, '', '', '201', '100'), null);
  assert.equal(evaluateTrade(0, 0, '', '', '100', '100'), null);
  assert.equal(evaluateTrade(0, 100, '80', '', '100', '100').market.difference, 20);
});
