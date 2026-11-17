// Daily updater for research_model_2.
// node tools/update.js            -> fetch all companies, write data/latest.json + data/history/<date>.json
// node tools/update.js SBIN TCS   -> only these (for testing; does not overwrite latest.json, prints instead)
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./screener.js');
const rules = require('../rules.json');
const E = require('../engine.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const NIFTY50_CSV = 'https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv';

// Header names Screener may show for each column when logged in (long screen names + short table headers).
const ALIASES = {
  price: ['Current Price', 'CMP Rs.', 'CMP'],
  np_last_year: ['Net Profit last year', 'NP Ann Rs.Cr.'],
  np_latest_qtr: ['Net Profit latest quarter', 'NP Qtr Rs.Cr.'],
  div_payout_3y: ['Average dividend payout 3years', 'Avg Div Payout 3Yrs %'],
  div_yield: ['Dividend yield', 'Div Yld %'],
  ret_1d: ['Return over 1day', '1day return %'],
  ret_1w: ['Return over 1week', 'ret 1 wk', '1wk return %'],
  ret_1m: ['Return over 1month', '1mth return %'],
  ret_3m: ['Return over 3months', '3mth return %'],
  ret_6m: ['Return over 6months', '6mth return %'],
  ret_1y: ['Return over 1year', '1Yr return %'],
  ret_3y: ['Return over 3years', '3Yrs return %'],
  roe_5y_var: ['Return on equity 5years growth', 'ROE 5Yr Var %'],
  profit_growth: ['Profit growth', 'Profit growth %'],
  eps: ['EPS', 'EPS 12M Rs.'],
  ret_5y: ['Return over 5years', '5Yrs return %'],
  profit_growth_3y: ['Profit growth 3Years', 'Profit Var 3Yrs %'],
  earnings_yield: ['Earnings yield', 'Earnings Yield %'],
  piotroski: ['Piotroski score', 'Piotski Scr'],
  g_factor: ['G Factor'],
  opm: ['OPM', 'OPM %'],
  debt_equity: ['Debt to equity', 'Debt / Eq'],
  np_ttm: ['Net profit', 'NP 12M Rs.Cr.'],
  np_prev_year: ['Net Profit preceding year', 'NP Prev Ann Rs.Cr.'],
  avg_ebit_5y: ['Average EBIT 5Year', 'Avg EBIT 5Yrs Rs.Cr.'],
  net_cf_last_year: ['Net cash flow last year', 'Net CF Rs.Cr.'],
  net_cf_prev_year: ['Net cash flow preceding year', 'Net CF PY Rs.Cr.'],
  exports_pct: ['Exports percentage', 'Export %'],
  dma_50: ['DMA 50', '50 DMA Rs.'],
  industry_pe: ['Industry PE', 'Ind PE'],
  pat_latest_qtr: ['Profit after tax latest quarter', 'PAT Qtr Rs.Cr.'],
  current_ratio: ['Current ratio'],
  int_cover_a: ['int coverage ratio', 'int cov ratio'],
  roa: ['Return on assets', 'ROA 12M %'],
  sales: ['Sales', 'Sales Rs.Cr.'],
  pat_annual: ['Profit after tax', 'PAT 12M Rs.Cr.'],
  int_cover_b: ['Interest Coverage Ratio', 'Int Coverage'],
  ev_ebitda: ['EVEBITDA', 'EV / EBITDA'],
  roe: ['Return on equity', 'ROE %'],
  sales_growth: ['Sales growth', 'Sales growth %'],
  ev: ['Enterprise Value', 'EV Rs.Cr.'],
  price_sales: ['Price to Sales', 'CMP / Sales'],
  pe: ['Price to Earning', 'P/E'],
  roce: ['Return on capital employed', 'ROCE %'],
  sales_growth_3y: ['Sales growth 3Years', 'Sales Var 3Yrs %'],
  avg_roe_3y: ['Average return on equity 3Years', 'ROE 3Yr %'],
  ebit: ['EBIT', 'EBIT 12M Rs.Cr.'],
  opm_prev_year: ['OPM preceding year', 'OPM PY %'],
  np_prev_12m: ['Net profit preceding 12months', 'NP Prev 12M Rs.Cr.'],
  fcf_prev_year: ['Free cash flow preceding year', 'Free Cash Flow PY Rs.Cr.'],
  fcf_3y: ['Free cash flow 3years', 'Free Cash Flow 3Yrs Rs.Cr.'],
  inventory_turnover: ['Inventory turnover ratio', 'Inven TO'],
  quick_ratio: ['Quick ratio']
};
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function istNow() {
  const d = new Date(Date.now() + 330 * 60000);
  return { date: d.toISOString().slice(0, 10), text: d.toISOString().slice(0, 16).replace('T', ' ') + ' IST' };
}

async function universe() {
  const cache = path.join(DATA, 'companies.json');
  let list = null;
  try {
    const csv = await S.get(NIFTY50_CSV);
    const lines = csv.trim().split(/\r?\n/).slice(1).map(l => l.split(','));
    list = lines.filter(x => x[2]).map(x => ({ symbol: x[2].trim(), name: x[0].replace(/ Ltd\.?$/, '').trim(), industry: x[1].trim(), isin: x[4] && x[4].trim(), index: 'NIFTY 50' }));
    if (list.length < 45) throw new Error('only ' + list.length + ' rows');
    fs.writeFileSync(cache, JSON.stringify(list, null, 1));
  } catch (e) {
    console.log('NSE list not reachable (' + e.message + '); using cached list');
    list = JSON.parse(fs.readFileSync(cache, 'utf8'));
  }
  const extraFile = path.join(ROOT, 'extra.json');
  if (fs.existsSync(extraFile)) {
    for (const x of JSON.parse(fs.readFileSync(extraFile, 'utf8'))) if (!list.some(c => c.symbol === x.symbol)) list.push({ index: 'extra', ...x });
  }
  return list;
}

async function loggedIn(list) {
  const email = process.env.SCREENER_EMAIL, pw = process.env.SCREENER_PASSWORD;
  if (!email || !pw) return null;
  await S.login(email, pw);
  console.log('Screener login OK');
  const idx = await S.indexTable(process.env.SCREENER_INDEX || 'NIFTY');
  console.log('Index page columns:', (idx.head || []).join(' | '));
  const map = {};
  const heads = (idx.head || []).map(h => [h, norm(h)]);
  for (const [k, names] of Object.entries(ALIASES)) {
    const want = names.map(norm);
    const hit = heads.find(([, n]) => want.includes(n));
    if (hit) map[k] = hit[0];
  }
  // Both interest-cover columns in the Excel are the same figure; one Screener column fills both.
  if (!map.int_cover_a && map.int_cover_b) map.int_cover_a = map.int_cover_b;
  if (!map.int_cover_b && map.int_cover_a) map.int_cover_b = map.int_cover_a;
  const missing = Object.keys(ALIASES).filter(k => !map[k]);
  if (missing.length) console.log('Not on the index page (will be worked out from public pages):', missing.join(', '));
  const bySlug = {};
  for (const r of idx.rows) { const m = r.href.match(/\/company\/([^/]+)\//); if (m) bySlug[decodeURIComponent(m[1]).toUpperCase()] = r; }
  const out = {};
  for (const c of list) {
    const r = bySlug[c.symbol.toUpperCase()];
    if (!r) continue;
    const v = {};
    for (const [k, h] of Object.entries(map)) v[k] = r.cols[h];
    out[c.symbol] = v;
  }
  return { values: out, mapped: Object.keys(map), missing };
}

async function main() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const now = istNow();
  let list = await universe();
  if (only.length) list = list.filter(c => only.includes(c.symbol)).concat(only.filter(s => !list.some(c => c.symbol === s)).map(s => ({ symbol: s, name: s })));

  let login = null, loginError = null;
  try { login = await loggedIn(list); } catch (e) { loginError = e.message; console.log('Screener login path failed: ' + e.message); }

  const companies = [], failed = [];
  for (const c of list) {
    const row = { symbol: c.symbol, name: c.name, industry: c.industry, index: c.index, values: {}, src: {} };
    const lv = login && login.values[c.symbol];
    let pub = null;
    const needPublic = !lv || login.missing.length || Object.values(lv).some(x => x == null);
    if (needPublic) {
      try { pub = await S.publicValues(c.symbol); } catch (e) { failed.push(c.symbol + ': ' + e.message); }
      await S.sleep(1200);
    }
    for (const p of rules.params.map(p => p.key).concat(['price', 'mcap', 'price_date', 'price_vs_dma'])) {
      if (lv && lv[p] != null) { row.values[p] = lv[p]; row.src[p] = 'login'; }
      else if (pub && pub.values[p] != null) { row.values[p] = pub.values[p]; row.src[p] = 'public'; }
      else row.values[p] = null;
    }
    if (pub) { row.basis = pub.basis; row.bank = pub.isBank; }
    if (!lv && !pub) continue;
    row.score = E.score(rules, row.values);
    companies.push(row);
    process.stdout.write(`${c.symbol} R${row.score.cnt.R} G${row.score.cnt.G} K${row.score.cnt.K} -> ${row.score.decision.label}\n`);
  }

  const out = {
    generated_at: now.text,
    date: now.date,
    source: login ? 'Screener (logged in) + public pages for gaps' : 'Screener public pages (no login)',
    login_error: loginError,
    login_columns: login ? login.mapped.length : 0,
    failed,
    companies
  };
  if (only.length) { console.log(JSON.stringify(out, null, 1).slice(0, 4000)); return; }
  if (companies.length < list.length * 0.8) {
    console.error(`Only ${companies.length} of ${list.length} companies fetched; keeping yesterday's data.`);
    console.error(failed.join('\n'));
    process.exit(1);
  }
  fs.mkdirSync(path.join(DATA, 'history'), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'latest.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(DATA, 'history', now.date + '.json'), JSON.stringify(out));
  const days = fs.readdirSync(path.join(DATA, 'history')).filter(f => f.endsWith('.json')).sort();
  fs.writeFileSync(path.join(DATA, 'history', 'index.json'), JSON.stringify(days.map(f => f.slice(0, 10))));
  console.log(`Wrote ${companies.length} companies (${failed.length} failed) at ${now.text}`);
}

main().catch(e => { console.error(e); process.exit(1); });
