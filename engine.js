// Red / green / black scoring, shared by the browser page and Node tools.
(function (root) {
  function test(cond, v) {
    if (cond == null) return false;
    cond = String(cond).replace(/\s+/g, '');
    if (!cond) return false;
    let m = cond.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
    if (m) return v >= +m[1] && v <= +m[2];
    m = cond.match(/^(<=|>=|<|>|=)(-?[\d.]+)$/);
    if (!m) return false;
    const n = +m[2];
    switch (m[1]) {
      case '<': return v < n;
      case '<=': return v <= n;
      case '>': return v > n;
      case '>=': return v >= n;
      case '=': return v === n;
    }
    return false;
  }
  function colour(p, v) {
    if (v == null || v === '' || Number.isNaN(+v)) return null; // not counted
    v = +v;
    if (test(p.red, v)) return 'R';
    if (test(p.green, v)) return 'G';
    return 'K';
  }
  function decide(cnt, d) {
    const ok = [cnt.R <= d.red_max, cnt.G >= d.green_min, cnt.K >= d.black_min];
    const n = ok.filter(Boolean).length;
    return { label: n === 3 ? d.labels.all3 : n === 2 ? d.labels.two : d.labels.else, met: n, ok };
  }
  function score(rules, values) {
    const cells = {}, cnt = { R: 0, G: 0, K: 0, missing: 0 };
    for (const p of rules.params) {
      const c = colour(p, values[p.key]);
      cells[p.key] = c;
      if (c) cnt[c]++; else cnt.missing++;
    }
    return { cells, cnt, decision: decide(cnt, rules.decision) };
  }
  const api = { test, colour, decide, score };
  if (typeof module !== 'undefined') module.exports = api; else root.RGB = api;
})(this);
