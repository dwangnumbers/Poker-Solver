/* Aggregate flop reports: solve one spot on a weighted set of flops and tabulate strategies, values and equities. */
(function () {
  'use strict';
  const E = PSEngine, U = PSUI, $ = U.$, esc = U.esc, fmt = U.fmt, pct = U.pct;

  /* ---- the 1,755 flops that differ up to a permutation of suits, with their multiplicities (sum 22,100) ---- */
  const PERMS = []; (function perm(a, k) { if (k === 4) { PERMS.push(a.slice()); return; } for (let i = k; i < 4; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } })([0, 1, 2, 3], 0);
  function canonical(cards) {
    let best = null;
    for (const p of PERMS) { const m = cards.map(c => (c & ~3) | p[c & 3]).sort((x, y) => y - x); const key = m[0] * 2704 + m[1] * 52 + m[2]; if (best === null || key < best.key) best = { key, m }; }
    return best;
  }
  function allFlops() {
    const map = new Map();
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) {
      const cf = canonical([a, b, c]); const e = map.get(cf.key); if (e) e.w++; else map.set(cf.key, { cards: cf.m, w: 1 });
    }
    const list = [...map.values()];
    for (const f of list) {
      const r = f.cards.map(c => c >> 2).sort((x, y) => y - x), s = new Set(f.cards.map(c => c & 3)).size;
      f.ranks = r; f.suits = s; f.paired = r[0] === r[1] || r[1] === r[2];
      f.texture = s === 1 ? 'monotone' : s === 2 ? 'two-tone' : 'rainbow';
      f.label = f.cards.map(E.cardStr).join('');
      f.group = null;
    }
    // board order: high card, then middle and low card, then suits (rainbow, two-tone, monotone)
    list.sort((x, y) => (y.ranks[0] - x.ranks[0]) || (y.ranks[1] - x.ranks[1]) || (y.ranks[2] - x.ranks[2]) || (y.suits - x.suits));
    return list;
  }
  /* Representative subset, stratified by texture: the flops are split into groups (rainbow, two-tone and monotone
     unpaired boards, paired boards by suits, trips); each group receives a number of flops proportional to its
     multiplicity (at least one), and within a group the board-ordered list is cut into pieces of equal multiplicity.
     A piece is represented by its middle flop, which carries the multiplicity of the whole piece as its weight. */
  function group(f) { return f.ranks[0] === f.ranks[2] ? 'trips' : f.paired ? (f.suits === 3 ? 'paired rainbow' : 'paired two-tone') : f.texture; }
  function subset(list, n) {
    if (n >= list.length) return list.map(f => Object.assign({}, f));
    const groups = new Map(); for (const f of list) { const k = group(f); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
    const tot = list.reduce((s, f) => s + f.w, 0), G = [...groups.entries()].map(([k, fs]) => ({ k, fs, w: fs.reduce((s, f) => s + f.w, 0) }));
    G.forEach(g => { g.q = n * g.w / tot; g.m = Math.max(1, Math.floor(g.q)); });
    let left = n - G.reduce((s, g) => s + g.m, 0);
    G.slice().sort((a, b) => (b.q - Math.floor(b.q)) - (a.q - Math.floor(a.q))).forEach(g => { if (left > 0 && g.q > g.m) { g.m++; left--; } });
    const out = [];
    for (const g of G) {
      let acc = 0, piece = [], made = 0;
      for (const f of g.fs) {
        piece.push(f); acc += f.w;
        if (acc >= g.w * (made + 1) / g.m - 1e-9 || f === g.fs[g.fs.length - 1]) {
          const rep = piece[Math.floor(piece.length / 2)]; out.push(Object.assign({}, rep, { w: piece.reduce((s, x) => s + x.w, 0) })); piece = []; made++;
        }
      }
    }
    out.sort((x, y) => list.indexOf(x) - list.indexOf(y));
    const order = new Map(list.map((f, i) => [f.label, i])); out.sort((x, y) => order.get(x.label) - order.get(y.label));
    return out;
  }
  const FLOPS = allFlops();
  const S = { running: false, rows: [], sort: 'order', pool: null };

  function initForm() {
    const opts = Object.keys(U.RANGES).map(k => `<option>${esc(k)}</option>`).join('');
    $('r0p').innerHTML = opts; $('r1p').innerHTML = opts;
    $('r0p').value = 'BB call vs BTN 2.5x'; $('r1p').value = 'BTN open (100bb)';
    const sync = p => { $('r' + p).value = U.RANGES[$('r' + p + 'p').value]; };
    $('r0p').onchange = () => sync(0); $('r1p').onchange = () => sync(1); sync(0); sync(1);
    $('threads').value = Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4));
    const info = () => { const n = +$('subset').value; const sub = subset(FLOPS, n); const by = {}; sub.forEach(f => { const k = group(f); by[k] = (by[k] || 0) + 1; });
      $('subsetInfo').textContent = `${sub.length} flops standing for all ${FLOPS.length} flops that differ up to the suits (22,100 deals of three cards): ${Object.entries(by).map(([k, v]) => v + ' ' + k).join(', ')}. Each flop is weighted by the number of deals it stands for.`; };
    $('subset').onchange = info; info();
  }
  const sizes = s => String(s).split(/[,\s]+/).filter(Boolean).map(Number).filter(x => x > 0);
  function treeCfg() {
    const later = $('later').value === 'one' ? { oop: { bet: [75], raise: [] }, ip: { bet: [75], raise: [] } } : { oop: { bet: [], raise: [] }, ip: { bet: [], raise: [] } };
    return { streets: { flop: { oop: { bet: sizes($('fb0').value), raise: sizes($('fr').value) }, ip: { bet: sizes($('fb1').value), raise: sizes($('fr').value) } }, turn: later, river: later }, maxBets: 2, allinThreshold: 0.67, mergeTolerance: 0.1 };
  }
  const rangeEq = (an, p) => { let a = 0, w = 0; for (let i = 0; i < an.reach[p].length; i++) { const m = an.reach[p][i] * an.ev[p].mass[i]; if (m > 0 && isFinite(an.equity[p][i])) { a += m * an.equity[p][i]; w += m; } } return w ? a / w : NaN; };
  async function solveFlop(f, base) {
    const cfg = Object.assign({}, base, { board: f.cards.slice() });
    const pool = await PSPool.Pool.create(cfg, { workers: +$('threads').value || 4, url: 'js/worker.js' }); S.pool = pool;
    const target = +$('target').value || 0.5, maxIt = +$('maxIt').value || 150;
    let r = null, it = 0;
    try {
      while (it < maxIt && S.running) { const n = Math.min(it < 20 ? 10 : 25, maxIt - it); await pool.iterate(n); it += n; r = await pool.evaluate(); if (r.exploitPct <= target) break; }
      if (!r) return null;
      const root = await pool.analyse([]), row = { flop: f, it, expl: r.exploitPct, val: r.val, eq0: rangeEq(root, 0), oop: null, ip: null };
      const pick = an => ({ labels: an.acts.map(a => a.label), freq: an.freq });
      if (root.type === 'd' && root.p === 0) {
        row.oop = pick(root);
        const ci = root.acts.findIndex(a => a.kind === 'check');
        if (ci >= 0) { const an = await pool.analyse([ci]); if (an && an.type === 'd' && an.p === 1) row.ip = pick(an); }
      } else if (root.type === 'd' && root.p === 1) row.ip = pick(root);
      return row;
    } finally { pool.terminate(); S.pool = null; }
  }
  async function run() {
    if (S.running) return;
    S.running = true; S.rows = []; $('btnRun').disabled = true; $('btnStop').disabled = false; $('btnCsv').disabled = true;
    const base = { pot: +$('pot').value, stack: +$('stack').value, ranges: [E.parseRange($('r0').value), E.parseRange($('r1').value)], tree: treeCfg() };
    const list = subset(FLOPS, +$('subset').value), t0 = performance.now();
    try {
      for (let k = 0; k < list.length && S.running; k++) {
        $('status').innerHTML = `Solving flop ${k + 1} of ${list.length}: <b>${list[k].cards.map(U.cardText).join('')}</b>`;
        const row = await solveFlop(list[k], base); if (row) S.rows.push(row);
        $('prog').style.width = (100 * (k + 1) / list.length) + '%';
        const el = (performance.now() - t0) / 1000, left = el / (k + 1) * (list.length - k - 1);
        $('status').innerHTML = `Solved ${k + 1} of ${list.length} flops in ${el.toFixed(0)} s, about ${left.toFixed(0)} s to go.`;
        render();
      }
      $('status').innerHTML += S.running ? ' Done.' : ' Stopped.';
    } catch (err) { console.error(err); $('status').innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
    S.running = false; $('btnRun').disabled = false; $('btnStop').disabled = true; $('btnCsv').disabled = !S.rows.length;
  }
  function labelsOf(key) { const r = S.rows.find(x => x[key]); return r ? r[key].labels : []; }
  function cols(labels) { return U.actionColors(labels.map(l => ({ kind: l.split(' ')[0] }))); }
  function bar(x, labels) { if (!x) return '<span class="muted">n/a</span>'; const c = cols(labels); return `<span class="bar">${x.freq.map((f, i) => `<i style="width:${100 * f}%;background:${c[i]}" title="${esc(labels[i])} ${pct(f)}"></i>`).join('')}</span>`; }
  function render() {
    const rows = S.rows.slice(), L0 = labelsOf('oop'), L1 = labelsOf('ip');
    const betShare = r => r.ip ? 1 - r.ip.freq[r.ip.labels.findIndex(l => l.startsWith('check'))] : 0;
    if (S.sort === 'bet') rows.sort((a, b) => betShare(b) - betShare(a)); else if (S.sort === 'ev') rows.sort((a, b) => b.val[0] - a.val[0]);
    // weighted summary
    const W = S.rows.reduce((s, r) => s + r.flop.w, 0), avg = f => S.rows.reduce((s, r) => s + r.flop.w * f(r), 0) / W;
    const avgFreq = key => { const L = labelsOf(key); return L.map((_, i) => avg(r => r[key] ? r[key].freq[i] : 0)); };
    const potv = +$('pot').value;
    let sm = `<table class="datatab"><tr><th>Quantity</th><th>Weighted average over ${S.rows.length} flops</th></tr>
      <tr><td>OOP value, chips per hand</td><td>${avg(r => r.val[0]).toFixed(3)} (${pct(avg(r => r.val[0]) / potv + 0.5)} of the pot realised)</td></tr>
      <tr><td>IP value, chips per hand</td><td>${avg(r => r.val[1]).toFixed(3)} (${pct(avg(r => r.val[1]) / potv + 0.5)} of the pot realised)</td></tr>
      <tr><td>OOP equity</td><td>${pct(avg(r => r.eq0))}</td></tr>
      <tr><td>Exploitability, % of pot</td><td>${avg(r => r.expl).toFixed(3)} (largest ${Math.max(...S.rows.map(r => r.expl)).toFixed(3)})</td></tr>`;
    if (L0.length) sm += `<tr><td>OOP first action</td><td>${avgFreq('oop').map((f, i) => `${esc(L0[i])} ${pct(f)}`).join(', ')}</td></tr>`;
    if (L1.length) sm += `<tr><td>IP ${L0.length ? 'after a check' : 'first action'}</td><td>${avgFreq('ip').map((f, i) => `${esc(L1[i])} ${pct(f)}`).join(', ')}</td></tr>`;
    $('summary').innerHTML = sm + '</table>';
    $('sumInfo').textContent = `weights sum to ${W.toLocaleString()} of 22,100 flops`;
    let h = `<tr><th>Flop</th><th>Weight</th><th>OOP EV</th><th>OOP equity</th>${L0.length ? '<th>OOP: ' + L0.map(esc).join(' / ') + '</th>' : ''}${L1.length ? '<th>IP: ' + L1.map(esc).join(' / ') + '</th>' : ''}<th>Expl. %</th><th>Iter.</th></tr>`;
    for (const r of rows) h += `<tr><td>${r.flop.cards.map(U.cardText).join('')}</td><td>${r.flop.w}</td><td>${r.val[0].toFixed(2)}</td><td>${pct(r.eq0)}</td>${L0.length ? `<td>${bar(r.oop, L0)}</td>` : ''}${L1.length ? `<td>${bar(r.ip, L1)}</td>` : ''}<td>${r.expl.toFixed(2)}</td><td>${r.it}</td></tr>`;
    $('table').innerHTML = h;
  }
  function csv() {
    const L0 = labelsOf('oop'), L1 = labelsOf('ip');
    const rows = [['flop', 'weight', 'texture', 'oop_value', 'ip_value', 'oop_equity'].concat(L0.map(l => 'oop_' + l), L1.map(l => 'ip_' + l), ['exploitability_pct', 'iterations']).join(',')];
    for (const r of S.rows) rows.push([r.flop.label, r.flop.w, r.flop.texture, r.val[0].toFixed(4), r.val[1].toFixed(4), r.eq0.toFixed(4)].concat(L0.map((_, i) => r.oop ? r.oop.freq[i].toFixed(4) : ''), L1.map((_, i) => r.ip ? r.ip.freq[i].toFixed(4) : ''), [r.expl.toFixed(4), r.it]).join(','));
    U.download('flop_report.csv', rows.join('\n'));
  }
  initForm();
  $('btnRun').onclick = run;
  $('btnStop').onclick = () => { S.running = false; };
  $('btnCsv').onclick = csv;
  $('sortModes').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.s; $('sortModes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); if (S.rows.length) render(); });
  window.PSReports = { allFlops, subset, canonical, group };
})();
