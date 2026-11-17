// Unit tests: node tools/test.js
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const E = require('../engine.js');
const rules = require('../rules.json');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('conditions', () => {
  assert(E.test('>=2000', 2000) && !E.test('>2000', 2000) && E.test('<0', -1) && !E.test('<0', 0));
  assert(E.test('20..50', 20) && E.test('20..50', 50) && !E.test('20..50', 50.1));
  assert(!E.test('', 5) && !E.test(null, 5));
});
t('net profit last year: >2000 green, 0-2000 black, <0 red', () => {
  const p = rules.params.find(p => p.key === 'np_last_year');
  assert.strictEqual(E.colour(p, 2500), 'G'); assert.strictEqual(E.colour(p, 1500), 'K'); assert.strictEqual(E.colour(p, -5), 'R'); assert.strictEqual(E.colour(p, null), null);
});
t('return 1 week: <=0 red, >1 green, between black', () => {
  const p = rules.params.find(p => p.key === 'ret_1w');
  assert.strictEqual(E.colour(p, 0), 'R'); assert.strictEqual(E.colour(p, 0.5), 'K'); assert.strictEqual(E.colour(p, 1), 'K'); assert.strictEqual(E.colour(p, 1.01), 'G');
});
t('decision rule', () => {
  const d = rules.decision;
  assert.strictEqual(E.decide({ R: 9, G: 21, K: 16 }, d).label, 'INVEST');
  assert.strictEqual(E.decide({ R: 10, G: 21, K: 16 }, d).label, 'WATCH');
  assert.strictEqual(E.decide({ R: 12, G: 20, K: 16 }, d).label, 'AVOID');
});
t('52 unique parameters', () => {
  assert.strictEqual(rules.params.length, 52);
  assert.strictEqual(new Set(rules.params.map(p => p.key)).size, 52);
});
t('rules reproduce uncle\'s colours on at least 99% of Excel cells', () => {
  const snap = require('../data/excel_2026-10-28.json');
  let ok = 0, all = 0;
  for (const co of snap) for (const p of rules.params) {
    const [v, u] = co.cells[p.col]; if (v == null) continue;
    all++; if (E.colour(p, v) === u) ok++;
  }
  assert(ok / all >= 0.99, `${ok}/${all}`);
});
t('Screener page parser (SBI fixture)', () => {
  // parse helpers are exercised through a stubbed fetch
  const html = fs.readFileSync(path.join(__dirname, '../tests/fixtures/SBIN.html'), 'utf8');
  assert(/data-company-id="3188"/.test(html));
  const S = require('./screener.js');
  assert.strictEqual(S.num('1,23,456'), 123456); assert.strictEqual(S.num('17%'), 17); assert.strictEqual(S.num(''), null);
});
(async () => {
  // publicValues on the saved SBI page, network stubbed (chart/peers/schedules empty)
  const html = fs.readFileSync(path.join(__dirname, '../tests/fixtures/SBIN.html'), 'utf8');
  global.fetch = async url => ({ ok: true, status: 200, headers: { getSetCookie: () => [] },
    text: async () => html, json: async () => ({ datasets: [] }) });
  const S = require('./screener.js');
  const r = await S.publicValues('SBIN');
  assert.strictEqual(r.basis, 'consolidated'); assert.strictEqual(r.isBank, true);
  assert.strictEqual(r.values.np_last_year, 86666);
  assert.strictEqual(r.values.np_prev_year, 80523);
  assert.strictEqual(r.values.net_cf_last_year, 43910);
  assert.strictEqual(r.values.roce, 6.13);
  assert.strictEqual(r.values.opm, null); // banks: not on the public page
  n++; console.log('ok  SBI public page -> numbers');
  console.log(`\n${n} tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
