// Screener.in reader for research_model_2.
// Two ways to get the 52 numbers:
//  1. Logged in (SCREENER_EMAIL + SCREENER_PASSWORD): read the index page (e.g. /company/NIFTY/)
//     with the account's own columns. Gives Screener's exact numbers, same as uncle's Excel.
//  2. Public (no login): read each company page + price chart + peers and work the numbers out.
//     Most columns match; a few are approximations and three (Piotroski, G Factor, Exports %)
//     cannot be had without login.
'use strict';
const BASE = 'https://www.screener.in';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let cookieJar = {};

function cookieHeader() { return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; '); }
function keepCookies(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of list) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) cookieJar[m[1]] = m[2]; }
}
async function get(path, { tries = 3, json = false, headers = {}, anon = true } = {}) {
  // Public pages are read without the login cookie, so they look the same as without login.
  const url = path.startsWith('http') ? path : BASE + path;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: BASE + '/', ...(anon ? {} : { Cookie: cookieHeader() }), ...headers }, redirect: 'follow' });
      if (!anon) keepCookies(res);
      if (res.status === 429) { await sleep(15000 * i); continue; }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return json ? res.json() : res.text();
    } catch (e) {
      if (i === tries) throw new Error(`${url}: ${e.message}`);
      await sleep(3000 * i);
    }
  }
  return null;
}

// ---------- parsing helpers ----------
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function num(s) {
  if (s == null) return null;
  s = String(s).replace(/[,%₹+\s]/g, '').replace('Cr.', '');
  if (s === '' || s === '-' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function table(html, id) {
  const sec = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`));
  if (!sec) return null;
  const t = sec[0].match(/<table class="data-table[\s\S]*?<\/table>/);
  if (!t) return null;
  const rows = [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map(r => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => strip(c[1])));
  const head = rows.shift().slice(1);
  const out = { head, rows: {} };
  for (const r of rows) { const k = r[0].replace(/\s*\+$/, '').trim(); if (k && !(k in out.rows)) out.rows[k] = r.slice(1).map(num); }
  return out;
}
function row(t, ...names) { if (!t) return null; for (const n of names) if (t.rows[n]) return t.rows[n]; return null; }
function ranges(html) {
  const out = {};
  for (const m of html.matchAll(/<table class="ranges-table">([\s\S]*?)<\/table>/g)) {
    const title = strip((m[1].match(/<th[^>]*>([\s\S]*?)<\/th>/) || [])[1] || '');
    out[title] = {};
    for (const r of m[1].matchAll(/<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g)) out[title][strip(r[1]).replace(':', '')] = num(strip(r[2]));
  }
  return out;
}
function topRatios(html) {
  const m = html.match(/<ul id="top-ratios">([\s\S]*?)<\/ul>/); const out = {};
  if (!m) return out;
  for (const li of m[1].matchAll(/<li[\s\S]*?<span class="name">([\s\S]*?)<\/span>([\s\S]*?)<\/li>/g)) {
    const vals = [...li[2].matchAll(/<span class="number">([\s\S]*?)<\/span>/g)].map(x => num(strip(x[1])));
    out[strip(li[1])] = vals.length > 1 ? vals : vals[0];
  }
  return out;
}
const sum = a => a.reduce((x, y) => x + y, 0);
const lastN = (a, n, back = 0) => { if (!a) return null; const s = a.slice(a.length - n - back, a.length - back); return s.length === n && s.every(v => v != null) ? s : null; };
const r2 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
const pct = (a, b) => a == null || b == null || b === 0 ? null : (a / b - 1) * 100 * (b < 0 ? -1 : 1);

async function companyPage(sym) {
  // Consolidated first (that's what uncle's numbers match); fall back to standalone.
  let html = await get(`/company/${encodeURIComponent(sym)}/consolidated/`), basis = 'consolidated';
  // Also fall back when the consolidated page has no top ratios (e.g. SBILIFE: consolidated
  // page shows only standalone "(S)" columns and blank Market Cap / P/E / ROE / ROCE).
  const empty = h => !h || !table(h, 'quarters') || !(row(table(h, 'quarters'), 'Net Profit') || []).some(v => v != null) || topRatios(h)['Market Cap'] == null;
  if (empty(html)) { html = await get(`/company/${encodeURIComponent(sym)}/`); basis = 'standalone'; }
  if (!html) throw new Error('no Screener page for ' + sym);
  return { html, basis };
}

async function schedule(cid, parent, section, consolidated) {
  const q = new URLSearchParams({ parent, section }); if (consolidated) q.set('consolidated', 'true');
  try { return await get(`/api/company/${cid}/schedules/?${q}`, { json: true }); } catch { return null; }
}
const lastVal = o => { if (!o) return null; const v = Object.values(o).map(num).filter(x => x != null); return v.length ? v[v.length - 1] : null; };

// ---------- public derivation ----------
async function publicValues(sym, opt = {}) {
  const dropQ = opt.dropQ || 0, asOf = opt.asOf || null;
  const { html, basis } = await companyPage(sym);
  const cid = (html.match(/data-company-id="(\d+)"/) || [])[1];
  const wid = (html.match(/data-warehouse-id="(\d+)"/) || [])[1];
  const isBank = /id="quarters"[\s\S]*?Financing Profit/.test(html);
  const q = table(html, 'quarters'), pl = table(html, 'profit-loss'), bs = table(html, 'balance-sheet'), cf = table(html, 'cash-flow');
  if (dropQ && q) { q.head = q.head.slice(0, -dropQ); for (const k in q.rows) q.rows[k] = q.rows[k].slice(0, -dropQ); }
  if (dropQ && bs && !/^Mar/.test(bs.head[bs.head.length - 1])) { bs.head.pop(); for (const k in bs.rows) bs.rows[k].pop(); }
  const top = topRatios(html), rg = ranges(html);
  const cons = basis === 'consolidated';
  let price = top['Current Price'], mcap = top['Market Cap'];
  const shares = price && mcap ? mcap / price : null; // crore shares
  const today = { price, dy: top['Dividend Yield'] };

  const fyIdx = pl ? pl.head.map((h, i) => /^Mar|^Dec|^Jun|^Sep/.test(h) ? i : -1).filter(i => i >= 0) : [];
  const ttmIdx = pl ? pl.head.indexOf('TTM') : -1;
  const at = (r, i) => r && i >= 0 ? r[i] : null;
  const fy = k => fyIdx[fyIdx.length - 1 - k];

  const qNP = row(q, 'Net Profit'), qSales = row(q, 'Sales', 'Revenue'), qOP = row(q, 'Operating Profit'), qEPS = row(q, 'EPS in Rs');
  const qPBT = row(q, 'Profit before tax'), qInt = row(q, 'Interest'), qDep = row(q, 'Depreciation');
  const plNP = row(pl, 'Net Profit'), plSales = row(pl, 'Sales', 'Revenue'), plOP = row(pl, 'Operating Profit');
  const plPBT = row(pl, 'Profit before tax'), plInt = row(pl, 'Interest'), plDep = row(pl, 'Depreciation');
  const plEPS = row(pl, 'EPS in Rs'), plPay = row(pl, 'Dividend Payout %');
  const ttm = (r, back = 0) => { const s = lastN(r, 4, back); return s ? sum(s) : null; };

  let P = [], D = [], W = [];
  if (cid) {
    const d = await get(`/api/company/${cid}/chart/?q=Price-DMA50&days=${asOf ? 400 + Math.round((Date.now() - Date.parse(asOf)) / 864e5) : 400}${cons ? '&consolidated=true' : ''}`, { json: true });
    P = (d && d.datasets.find(x => x.metric === 'Price') || { values: [] }).values.map(x => [x[0], +x[1]]);
    D = (d && d.datasets.find(x => x.metric === 'DMA50') || { values: [] }).values.map(x => [x[0], +x[1]]);
    const w = await get(`/api/company/${cid}/chart/?q=Price&days=1900${cons ? '&consolidated=true' : ''}`, { json: true });
    W = (w && w.datasets[0] || { values: [] }).values.map(x => [x[0], +x[1]]);
    if (asOf) { P = P.filter(x => x[0] <= asOf); D = D.filter(x => x[0] <= asOf); W = W.filter(x => x[0] <= asOf); }
    if (asOf && P.length && shares) { price = P[P.length - 1][1]; mcap = price * shares; }
  }
  const v = { price, mcap };
  v.np_last_year = at(plNP, fy(0));
  v.np_prev_year = at(plNP, fy(1));
  v.np_latest_qtr = qNP ? qNP[qNP.length - 1] : null;
  const pays = fyIdx.slice(-3).map(i => at(plPay, i));
  v.div_payout_3y = pays.every(x => x != null) ? sum(pays) / 3 : null;
  v.div_yield = top['Dividend Yield'] != null && today.price ? top['Dividend Yield'] * today.price / price : null;
  v.np_ttm = ttm(qNP) ?? at(plNP, ttmIdx);
  v.np_prev_12m = ttm(qNP, 1);
  v.profit_growth = pct(ttm(qNP), ttm(qNP, 4));
  v.eps = ttm(qEPS) ?? at(plEPS, ttmIdx);
  v.profit_growth_3y = rg['Compounded Profit Growth'] ? rg['Compounded Profit Growth']['3 Years'] : null;
  v.sales_growth_3y = rg['Compounded Sales Growth'] ? rg['Compounded Sales Growth']['3 Years'] : null;
  v.avg_roe_3y = rg['Return on Equity'] ? rg['Return on Equity']['3 Years'] : null;
  v.sales = ttm(qSales) ?? at(plSales, ttmIdx);
  v.sales_growth = pct(ttm(qSales), ttm(qSales, 4));
  if (!isBank) {
    v.opm = ttm(qOP) != null && v.sales ? ttm(qOP) / v.sales * 100 : null;
    v.opm_prev_year = at(plOP, fy(1)) != null && at(plSales, fy(1)) ? at(plOP, fy(1)) / at(plSales, fy(1)) * 100 : null;
  }
  const ebit = (pbt, int) => pbt != null && int != null ? pbt + int : null;
  v.ebit = ebit(ttm(qPBT), ttm(qInt));
  const ebits = fyIdx.slice(-5).map(i => ebit(at(plPBT, i), at(plInt, i)));
  v.avg_ebit_5y = ebits.length === 5 && ebits.every(x => x != null) ? sum(ebits) / 5 : null;
  v.int_cover_a = v.int_cover_b = v.ebit != null && ttm(qInt) ? v.ebit / ttm(qInt) : null;
  v.pat_annual = v.eps != null && shares ? v.eps * shares : null;
  v.pat_latest_qtr = qEPS && shares ? qEPS[qEPS.length - 1] * shares : null;
  v.pe = asOf ? (v.eps > 0 ? price / v.eps : null) : top['Stock P/E'];
  v.roe = top['ROE'];
  v.roce = top['ROCE'];
  v.price_sales = mcap && v.sales ? mcap / v.sales : null;

  // balance sheet (latest column)
  const L = r => r ? r[r.length - 1] : null;
  const equity = (L(row(bs, 'Equity Capital')) || 0) + (L(row(bs, 'Reserves')) || 0);
  const debt = (L(row(bs, 'Borrowings', 'Borrowing')) || 0) + (isBank ? (L(row(bs, 'Deposits')) || 0) : 0);
  v.debt_equity = equity ? debt / equity : null;
  v.roa = v.np_ttm != null && L(row(bs, 'Total Assets')) ? v.np_ttm / L(row(bs, 'Total Assets')) * 100 : null;
  let cash = null;
  if (cid) {
    const oa = await schedule(cid, 'Other Assets', 'balance-sheet', cons);
    const ol = await schedule(cid, 'Other Liabilities', 'balance-sheet', cons);
    if (oa) {
      cash = lastVal(oa['Cash Equivalents']);
      if (!isBank) {
        // Current ratio, quick ratio and inventory turnover: the public page does not split current
        // assets/liabilities, and a back-test against uncle's sheet matched his colour only about half
        // the time, so these are left to the logged-in read.
      }
    }
  }
  v.ev = mcap != null ? mcap + debt - (cash || 0) : null;
  v.earnings_yield = v.ebit != null && v.ev ? v.ebit / v.ev * 100 : null;
  const ebitda = v.ebit != null ? v.ebit + (ttm(qDep) || 0) : null;
  v.ev_ebitda = ebitda ? v.ev / ebitda : null;

  // cash flow (annual)
  const cfNet = row(cf, 'Net Cash Flow'), cfF = row(cf, 'Free Cash Flow');
  v.net_cf_last_year = cfNet ? cfNet[cfNet.length - 1] : null;
  v.net_cf_prev_year = cfNet ? cfNet[cfNet.length - 2] : null;
  // Screener's 'Free cash flow' ratios don't match the FCF row on the page, so leave them to the logged-in read.
  v.fcf_prev_year = v.fcf_3y = null;

  // prices
  if (P.length) {
    const last = P[P.length - 1];
    const back = (S, days) => { const t = new Date(S[S.length - 1][0]); t.setDate(t.getDate() - days); const iso = t.toISOString().slice(0, 10); let p = null; for (const x of S) if (x[0] <= iso) p = x[1]; return p; };
    v.price_date = last[0];
    v.ret_1d = P.length > 1 ? pct(last[1], P[P.length - 2][1]) : null;
    v.ret_1w = pct(last[1], back(P, 7)); v.ret_1m = pct(last[1], back(P, 30)); v.ret_3m = pct(last[1], back(P, 91));
    v.ret_6m = pct(last[1], back(P, 182)); v.ret_1y = pct(last[1], back(P, 365));
    v.dma_50 = D.length ? D[D.length - 1][1] : null;
    v.price_vs_dma = v.dma_50 ? pct(last[1], v.dma_50) : null;
    const cagr = y => { const p0 = back(W, Math.round(365.25 * y)); return p0 && W.length ? (Math.pow(last[1] / p0, 1 / y) - 1) * 100 : null; };
    if (W.length) { v.ret_3y = cagr(3); v.ret_5y = cagr(5); }
  }
  if (wid) {
    const ph = await get(`/api/company/${wid}/peers/`, { anon: true }); // logged-in view shows the account's own columns, without P/E
    if (ph) {
      const med = ph.match(/<tr[^>]*>(?:(?!<\/tr>)[\s\S])*?Median[\s\S]*?<\/tr>/);
      const head = [...(ph.match(/<tr[\s\S]*?<\/tr>/) || [''])[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(x => strip(x[1]));
      if (med) {
        const cells = [...med[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => strip(x[1]));
        const i = head.indexOf('P/E');
        // median row: one cell "Median: N Co." covers S.No + Company
        const off = cells.findIndex(c => /Median/.test(c));
        if (i >= 0 && off >= 0) v.industry_pe = num(cells[off + i - 1]);
      }
    }
  }
  // Not on the public page: Piotroski, G Factor, Exports %, ROE 5-year growth
  v.piotroski = v.g_factor = v.exports_pct = v.roe_5y_var = null;
  for (const p of require('../rules.json').params) if (!(p.key in v)) v[p.key] = null;
  for (const k in v) v[k] = typeof v[k] === 'number' ? r2(v[k]) : (v[k] === undefined ? null : v[k]);
  return { values: v, basis, isBank, cid, wid };
}

// ---------- logged-in path ----------
async function login(email, password) {
  cookieJar = {};
  const page = await get('/login/', { anon: false });
  const tok = (page.match(/name="csrfmiddlewaretoken" value="([^"]+)"/) || [])[1];
  if (!tok) throw new Error('login page has no CSRF token');
  const body = new URLSearchParams({ csrfmiddlewaretoken: tok, username: email, password, next: '/' });
  const res = await fetch(BASE + '/login/', {
    method: 'POST', redirect: 'manual', body,
    headers: { 'User-Agent': UA, Referer: BASE + '/login/', Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  keepCookies(res);
  if (!cookieJar.sessionid) throw new Error('Screener login failed (status ' + res.status + ')');
  return true;
}
// Reads the index page with the account's own columns. Returns rows of {name, href, cols:{header:value}}.
async function indexTable(index) {
  const out = []; let head = null;
  for (let page = 1; page <= 20; page++) {
    const html = await get(`/company/${index}/?page=${page}`, { anon: false });
    if (!html) break;
    const t = html.match(/<table class="data-table[\s\S]*?<\/table>/);
    if (!t) break;
    const trs = [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map(x => x[0]);
    let added = 0;
    for (const tr of trs) {
      if (/<th/.test(tr)) { head = [...tr.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(x => strip(x[1])); continue; }
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
      if (!head || tds.length < 3) continue;
      const href = (tds[1].match(/href="([^"]+)"/) || [])[1];
      if (!href) continue;
      const cols = {}; head.forEach((h, i) => { cols[h] = i > 1 ? num(strip(tds[i] || '')) : strip(tds[i] || ''); });
      out.push({ name: strip(tds[1]), href, cols }); added++;
    }
    if (!added || !/page=\d+[^"]*"[^>]*>\s*Next|rel="next"/i.test(html) && !html.includes(`page=${page + 1}`)) break;
    await sleep(1500);
  }
  return { head, rows: out };
}

module.exports = { get, publicValues, login, indexTable, num, strip, sleep };
