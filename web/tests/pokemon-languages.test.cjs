const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/lib/${file}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, AbortSignal, ...extra, require: key => { if (key in dependencies) return dependencies[key]; throw Error(key); } });
  return exports;
}
test('language aliases distinguish Chinese scripts and Korean; other games exclude additions', () => {
  const l = load('languages');
  for (const [input, expected] of [['CN','zh-cn'],['zh-Hans','zh-cn'],['Traditional Chinese','zh-tw'],['zh-Hant','zh-tw'],['KR','kor'],['한국어','kor'],['JP','jap']]) assert.equal(l.normalizeCardLanguage(input), expected);
  assert.equal(l.languageOptions('mtg').length, 2);
  assert.equal(l.languageOptions('pokemon').length, 5);
  assert.equal(l.normalizeCardLanguage('unknown'), null);
});
test('catalog preserves language identity and ignores shared market pricing', () => {
  const l = load('languages');
  const c = load('tcgdex', { './languages': l, './cache': {}, './types': {} });
  const data = { id:'SV5K-001', localId:'001', name:'로젤리아', set:{id:'SV5K',name:'와일드포스'}, pricing:{cardmarket:{avg:100}}, image:'https://assets.tcgdex.net/ko/card' };
  const a = c.normalizeDexCard(data, 'kor');
  const b = c.normalizeDexCard(data, 'zh-tw');
  assert.notEqual(a.id,b.id);
  assert.equal(a.language,'kor');
  assert.equal(a.tcg,'pokemon');
  assert.equal(Object.keys(a.prices).length,0);
  assert.equal(a.imageUrl,'https://assets.tcgdex.net/ko/card/high.webp');
  assert.equal(c.normalizeDexCard({...data,image:undefined},'kor').imageUrl,null);
});
test('catalog surfaces upstream failures instead of silently caching empty data', async () => {
  const l = load('languages');
  const c = load('tcgdex', { './languages':l, './cache':{cached:async (_k,_t,fn)=>fn()}, './types':{} }, { fetch:async()=>({ok:false,status:503}) });
  await assert.rejects(c.dexSets('kor'),/503/);
});
test('search sends the requested language and only selects matching native names or set numbers', async () => {
  const l = load('languages');
  const urls = [];
  const c = load('tcgdex', { './languages':l, './cache':{cached:async (_k,_t,fn)=>fn()}, './types':{} }, { fetch:async url=> {
    urls.push(url);
    return {ok:true,json:async()=>url.endsWith('/cards') ? [{id:'SV5K-001',localId:'001',name:'로젤리아'},{id:'SV4K-001',name:'Other'}] : {id:'SV5K-001',localId:'001',name:'로젤리아',set:{id:'SV5K',name:'와일드포스'}}};
  }});
  const cards = await c.dexSearch('kor','SV5K 001',24);
  assert.equal(cards.length,1);
  assert.equal(cards[0].id,'td:kor:SV5K-001');
  assert.ok(urls.every(u=>u.includes('/ko/')));
});
test('sets without published card records stay empty', async () => {
  const c = load('tcgdex', { './cache':{cached:async (_k,_t,fn)=>fn()} }, { fetch:async()=>({ok:true,json:async()=>({id:'EMPTY',name:'Empty',cards:[]})}) });
  assert.equal((await c.dexSetCards('zh-cn','EMPTY')).length,0);
});
