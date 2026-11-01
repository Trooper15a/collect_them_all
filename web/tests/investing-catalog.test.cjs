/* eslint-disable @typescript-eslint/no-require-imports -- Execute the actual PostgreSQL query in an isolated in-memory database. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const drizzle = require('drizzle-orm');
const { PgDialect } = require('drizzle-orm/pg-core');
let PGlite;
try { ({ PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { /* Optional SQL integration runtime. */ }
function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib', file + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, require: (name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unexpected catalog dependency ' + name);
  } });
  return exports;
}
test('catalog SQL compares real dated history per source and variant across all Pokémon singles', { skip: !PGlite && 'Set PGLITE_MODULE for PostgreSQL integration', timeout: 30000 }, async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE TABLE cards(id text, tcg text, name text, set_name text, card_number text, language text, image_url text, prices_json text, meta_json text, rarity text);
      CREATE TABLE price_history(card_id text, variant_type text, date text, tcgplayer_market float8, cardmarket_avg float8);`);
    const now = Date.now(), day = (days) => new Date(now - days * 86400000).toISOString().slice(0, 10);
    const prices = JSON.stringify({ tcgplayer: { currency: 'USD', updatedAt: new Date(now).toISOString(), variants: { normal: { market: 110 }, reverseHolofoil: { market: 2 }, lowOnly: { low: 1 } } }, cardmarket: { currency: 'EUR', updatedAt: new Date(now).toISOString(), variants: { normal: { market: 88 } } } });
    for (const [id, tcg, sealed] of [['tp:1', 'pokemon', false], ['tp:sealed', 'pokemon', true], ['pw:duplicate', 'pokemon', false], ['tp:mtg', 'mtg', false]]) {
      await db.query('INSERT INTO cards VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,NULL)', [id, tcg, 'Pikachu', '151', '25', 'eng', prices, JSON.stringify({ sealed })]);
    }
    for (const [days, price] of [[7, 100], [30, 90], [35, 88], [40, 86], [45, 84]]) {
      await db.query('INSERT INTO price_history VALUES ($1,$2,$3,$4,$5)', ['tp:1', 'normal', day(days), price, price * .8]);
      await db.query('INSERT INTO price_history VALUES ($1,$2,$3,$4,$5)', ['tp:1', 'reverseHolofoil', day(days), 1, .8]);
    }
    const cash = load('card-show', {});
    const investing = load('investing', { './card-show': cash });
    let reads = 0;
    const repo = load('investing-catalog', {
      'drizzle-orm': drizzle, './investing': investing,
      './cards': { getCard: async () => null, getPriceHistory: async () => [] },
      '@/db': { db: { execute: async (query) => {
        reads++; const compiled = new PgDialect().sqlToQuery(query);
        return (await db.query(compiled.sql, compiled.params)).rows;
      } } },
    });
    const usd = await repo.getMarketCatalog('tcgplayer');
    assert.equal(usd.length, 2);
    const normal = usd.find((entry) => entry.analysis.reference.variant === 'normal');
    assert.equal(normal.id, 'tp:1');
    assert.equal(normal.analysis.samples, 5);
    assert.equal(normal.analysis.changes[7].date, day(7));
    assert.ok(Math.abs(normal.analysis.changes[7].percent - 10) < 1e-6);
    assert.equal(normal.analysis.research, true);
    assert.ok(usd.find((entry) => entry.analysis.reference.variant === 'reverseHolofoil').analysis.flags.some((flag) => flag.code === 'spike'));
    const eur = await repo.getMarketCatalog('cardmarket');
    assert.equal(eur.length, 1);
    assert.ok(Math.abs(eur[0].analysis.changes[7].percent - 10) < 1e-6);
    assert.equal(eur[0].analysis.reference.currency, 'EUR');
    await repo.getMarketCatalog('tcgplayer');
    assert.equal(reads, 2, 'per-source cache prevents repeat full-catalog queries');
  } finally { await db.close(); }
});
