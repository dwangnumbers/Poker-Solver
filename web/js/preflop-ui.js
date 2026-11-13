/* Preflop and multiway page: game set-up, DCFR in a worker with NashConv tracking, strategy browser, first-in table. */
(function () {
  'use strict';
  const E = PSEngine, P = PSPreflop, U = PSUI, $ = U.$, esc = U.esc, fmt = U.fmt, pct = U.pct;
  const PRESETS = {
    'Heads-up push or fold, 10 bb': { players: 2, stack: 10, ante: 0, open: 2, sbOpen: 2, tbIP: 3, tbOOP: 3, fb: 2.3, maxRaises: 1, thr: 0, maxToFlop: 2, allin: true, sbLimp: false },
    'Heads-up, 25 bb, raise, limp or shove': { players: 2, stack: 25, ante: 0, open: 2, sbOpen: 2, tbIP: 3, tbOOP: 3.5, fb: 2.2, maxRaises: 4, thr: 0.4, maxToFlop: 2, allin: true, sbLimp: true },
    'Three-handed push or fold, 12 bb, ante': { players: 3, stack: 12, ante: 0.1, open: 2, sbOpen: 2, tbIP: 3, tbOOP: 3, fb: 2.3, maxRaises: 1, thr: 0, maxToFlop: 3, allin: true, sbLimp: false },
    'Six-max, 100 bb, open, 3-bet, 4-bet': { players: 6, stack: 100, ante: 0, open: 2.5, sbOpen: 3, tbIP: 3, tbOOP: 4, fb: 2.3, maxRaises: 4, thr: 0.4, maxToFlop: 2, allin: true, sbLimp: false },
    'Six-max, 20 bb, with antes': { players: 6, stack: 20, ante: 0.125, open: 2.1, sbOpen: 2.5, tbIP: 3, tbOOP: 3.5, fb: 2.2, maxRaises: 3, thr: 0.4, maxToFlop: 2, allin: true, sbLimp: true },
  };
  const S = { worker: null, seq: 0, pending: new Map(), solving: false, hist: [], it: 0, path: [], an: null, mode: 'strategy', tabP: 0, hover: -1, sel: -1, names: [], N: 0 };
  function call(msg) { const id = ++S.seq; msg.id = id; return new Promise((res, rej) => { S.pending.set(id, { res, rej }); S.worker.postMessage(msg); }); }
  function newWorker() {
    if (S.worker) S.worker.terminate();
    S.worker = new Worker('js/preflop-worker.js');
    S.worker.onmessage = e => { const m = e.data, cb = S.pending.get(m.id); if (!cb) return; S.pending.delete(m.id); m.error ? cb.rej(new Error(m.error)) : cb.res(m); };
  }
  function readCfg() {
    const v = id => +$(id).value;
    return { players: v('players'), stack: v('stack'), ante: v('ante') || 0, open: v('open'), sbOpen: v('sbOpen'), threebetIP: v('tbIP'), threebetOOP: v('tbOOP'), fourbet: v('fb'),
      maxRaises: v('maxRaises'), allinThreshold: v('thr'), maxToFlop: v('maxToFlop'), allin: $('allin').checked, sbLimp: $('sbLimp').checked };
  }
  function loadPreset(p) {
    for (const k of ['players', 'stack', 'ante', 'open', 'sbOpen', 'tbIP', 'tbOOP', 'fb', 'maxRaises', 'thr', 'maxToFlop']) $(k).value = p[k];
    $('allin').checked = p.allin; $('sbLimp').checked = p.sbLimp; estimate();
  }
  function estimate() {
    try {
      const t = P.buildTree(readCfg()); let three = 0;
      (function walk(n) { if (n.t === 'd') n.ch.forEach(walk); else if (n.t === 's' && n.in.length === 3) three++; })(t.root);
      $('est').innerHTML = `<b>${t.decisions.length.toLocaleString()}</b> decision nodes, <b>${t.terminals.toLocaleString()}</b> terminal nodes of which <b>${three}</b> are three-way showdowns. Each iteration makes ${t.N} traversals, one per player.`;
    } catch (e) { $('est').innerHTML = `<span class="warn">${esc(e.message)}</span>`; }
  }
  // ---------------------------------------------------------------- solving
  async function solve(fresh) {
    if (S.solving) return; S.solving = true; buttons();
    try {
      if (fresh || !S.worker) {
        newWorker(); $('status').textContent = 'Loading the equity tables and building the tree...';
        const info = await call({ type: 'init', cfg: readCfg() });
        S.names = info.names; S.N = info.N; S.hist = []; S.it = 0; S.path = [];
        $('info').textContent = `${info.decisions.toLocaleString()} decisions, ${info.terminals.toLocaleString()} terminals`;
      }
      const target = (+$('target').value || 2) / 1000, it0 = S.it, maxIt = it0 + (+$('maxIt').value || 2000), t0 = performance.now();
      let every = 25, first = !fresh;
      while (S.solving && S.it < maxIt) {
        const n = Math.min(every, maxIt - S.it); await call({ type: 'iterate', n }); S.it += n;
        const r = (await call({ type: 'evaluate' })).res; S.last = r; S.hist.push([S.it, r.expl * 1000]);
        every = S.it < 100 ? 25 : S.it < 1000 ? 100 : 250;
        const per = (performance.now() - t0) / (S.it - it0);
        $('prog').style.width = Math.min(100, 100 * (S.it - it0) / (maxIt - it0)) + '%';
        $('status').innerHTML = `Iteration <b>${S.it}</b>: average best-response gain <b>${(1000 * r.expl).toFixed(2)}</b> mbb per hand (NashConv ${(1000 * r.nashConv).toFixed(2)}), ${per.toFixed(1)} ms per iteration. Values: ${r.val.map((v, p) => `${S.names[p]} ${v.toFixed(3)}`).join(', ')} bb.`;
        U.lineChart($('chart'), [{ color: 'var(--c-dcfr)', pts: S.hist }], { target: target * 1000, ylabel: 'mbb per hand' });
        if (r.expl <= target && !first) break;
        first = false;
      }
    } catch (err) { console.error(err); $('status').innerHTML = `<span class="warn">${esc(err.message)}</span>`; }
    S.solving = false; buttons();
    if (S.worker && S.N) { $('browser').hidden = false; await go(S.path); await renderRFI(); }
  }
  function buttons() { $('btnSolve').disabled = S.solving; $('btnStop').disabled = !S.solving; $('btnResume').disabled = S.solving || !S.worker; }
  // ---------------------------------------------------------------- browsing
  async function go(path) {
    const r = (await call({ type: 'analyse', path })).res;
    S.path = path; S.an = r; if (r.node.t === 'd') S.tabP = r.node.p; render();
  }
  function lineLabels(path) {
    // labels along the path: needs each node's actions, so they are kept as we go
    return S.labels ? S.labels.slice(0, path.length) : [];
  }
  function render() {
    const an = S.an, n = an.node, names = S.names;
    S.labels = S.labels || []; S.labels.length = S.path.length;
    $('navline').innerHTML = `<button type="button" data-k="0" class="${S.path.length ? '' : 'cur'}">Start</button>` + S.path.map((a, k) => `<span class="sep muted">›</span><button type="button" data-k="${k + 1}" class="${k === S.path.length - 1 ? 'cur' : ''}">${esc(S.labels[k] || '')}</button>`).join('');
    $('navline').querySelectorAll('button').forEach(b => b.onclick = () => go(S.path.slice(0, +b.dataset.k)));
    const pot = n.c.reduce((a, b) => a + b, 0) + (+$('ante').value || 0) * S.N;
    if (n.t === 'd') {
      $('nodehead').innerHTML = `<span><b>${names[n.p]}</b> to act</span><span>Pot <b>${fmt(pot)}</b> bb</span><span>To call ${fmt(Math.max(...n.c) - n.c[n.p])} bb</span>${n.locked ? '<span class="lockedtag">locked</span>' : ''}`;
      const cols = U.actionColors(n.acts);
      $('actions').innerHTML = n.acts.map((a, i) => `<button class="act" type="button" data-i="${i}"><span class="sw" style="background:${cols[i]}"></span><span class="nm">${esc(a.label)}</span><span class="fq">${pct(an.freq[i])}</span><span class="meter" style="width:${100 * an.freq[i]}%;background:${cols[i]}"></span></button>`).join('');
      $('actions').querySelectorAll('.act').forEach(b => b.onclick = () => { const i = +b.dataset.i; S.labels[S.path.length] = `${names[n.p]} ${n.acts[i].label}`; go(S.path.concat([i])); });
    } else {
      $('nodehead').innerHTML = n.t === 'f' ? `<span><b>${names[n.in[0]]}</b> wins the pot of ${fmt(pot)} bb</span>` : `<span><b>Flop</b> with ${n.in.map(p => names[p]).join(', ')}: settled by equity, pot ${fmt(pot)} bb</span>`;
      $('actions').innerHTML = '';
    }
    $('pTabs').innerHTML = names.map((nm, p) => `<button class="tab" type="button" data-p="${p}" aria-selected="${S.tabP === p}">${esc(nm)}${n.t === 'd' && n.p === p ? '<span class="sub">to act</span>' : ''}</button>`).join('');
    $('pTabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { S.tabP = +b.dataset.p; renderGrid(); renderDetail(); render(); });
    renderGrid(); renderDetail();
  }
  function renderGrid() {
    const an = S.an, n = an.node, p = S.tabP, acting = n.t === 'd' && n.p === p, cols = acting ? U.actionColors(n.acts) : null, r = an.reach[p];
    const evs = acting ? Array.from(an.ev).filter(isFinite) : [], lo = Math.min(...evs, -1), hi = Math.max(...evs, 1), m = Math.max(-lo, hi);
    for (let k = 0; k < 169; k++) {
      const frac = r[k] / P.CNT[k];
      if (S.mode === 'strategy' && acting) S.grid.set(k, frac, n.acts.map((a, i) => ({ w: an.strategy[i * 169 + k], c: cols[i] })), k === S.sel ? 'sel' : '');
      else if (S.mode === 'ev' && acting && frac > 0.004) S.grid.set(k, 1, [{ w: 1, c: U.heat(an.ev[k], -m, m) }], (U.heatLight(an.ev[k], -m, m) ? 'heatl' : 'heat') + (k === S.sel ? ' sel' : ''), isFinite(an.ev[k]) ? an.ev[k].toFixed(1) : '');
      else S.grid.set(k, frac, [{ w: 1, c: 'var(--p' + (p % 2) + ')' }], k === S.sel ? 'sel' : '');
    }
    if (S.mode === 'strategy' && acting) {
      $('legend').innerHTML = n.acts.map((a, i) => `<span><i style="background:${cols[i]}"></i>${esc(a.label)} ${pct(an.freq[i])}</span>`).join('');
      $('rangebar').hidden = false; $('rangebar').innerHTML = n.acts.map((a, i) => `<i style="width:${100 * an.freq[i]}%;background:${cols[i]}"></i>`).join('');
    } else {
      $('rangebar').hidden = true;
      $('legend').innerHTML = S.mode === 'ev' && acting ? '<span>EV of each hand in bb from this point, counting the blinds already posted as lost. Blue is negative, red positive.</span>' : `<span>Share of each hand of ${esc(S.names[p])} that reaches this point.</span>`;
    }
  }
  function renderDetail() {
    const an = S.an, n = an.node, p = S.tabP, k = S.hover >= 0 ? S.hover : S.sel, box = $('detail');
    if (k < 0 || n.t !== 'd' || n.p !== p) { box.innerHTML = '<p class="muted">Point at a hand of the player to act to see its strategy and the EV of each action.</p>'; return; }
    const cols = U.actionColors(n.acts);
    box.innerHTML = `<h3>${E.className(k)} <span class="muted" style="font-weight:400">${esc(S.names[p])}, ${P.CNT[k]} combos, ${pct(an.reach[p][k] / P.CNT[k])} reach here</span></h3><table><tr><th>Action</th><th>Frequency</th><th>EV, bb</th></tr>` +
      n.acts.map((a, i) => `<tr><td><span style="color:${cols[i]}">■</span> ${esc(a.label)}</td><td>${pct(an.strategy[i * 169 + k])}</td><td>${isFinite(an.actEV[i][k]) ? an.actEV[i][k].toFixed(3) : 'n/a'}</td></tr>`).join('') +
      `<tr><td><b>Mixed</b></td><td></td><td><b>${isFinite(an.ev[k]) ? an.ev[k].toFixed(3) : 'n/a'}</b></td></tr></table><p class="muted" style="margin:6px 0 0">An equilibrium mixes only between actions of (nearly) equal EV.</p>`;
  }
  /* first-in ranges: for each seat, the strategy when everyone before it has folded */
  async function renderRFI() {
    const N = S.N, rows = [];
    let path = [];
    for (let p = 0; p < N - 1; p++) {
      const r = (await call({ type: 'analyse', path })).res; const n = r.node; if (n.t !== 'd' || n.p !== p) break;
      const share = (pred) => { let s = 0, t = 0; for (let k = 0; k < 169; k++) { t += P.CNT[k]; for (let a = 0; a < n.na; a++) if (pred(n.acts[a])) s += P.CNT[k] * r.strategy[a * 169 + k]; } return s / t; };
      rows.push({ seat: S.names[p], raise: share(a => a.kind === 'raise'), allin: share(a => a.kind === 'allin'), limp: share(a => a.kind === 'call'), path: path.slice() });
      path = path.concat([0]);                                   // fold
    }
    $('rfiBox').hidden = false;
    $('rfi').innerHTML = `<table class="datatab"><tr><th>Seat</th><th>Raise</th><th>All-in</th><th>Limp</th><th>Plays</th></tr>` + rows.map((r, i) => `<tr><td><button class="btn small" type="button" data-i="${i}">${esc(r.seat)}</button></td><td>${pct(r.raise)}</td><td>${pct(r.allin)}</td><td>${pct(r.limp)}</td><td><b>${pct(r.raise + r.allin + r.limp)}</b></td></tr>`).join('') + '</table><p class="hint">Share of all 1,326 starting hands that each seat plays when everyone before it has folded. Click a seat to open its node.</p>';
    $('rfi').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const r = rows[+b.dataset.i]; S.labels = r.path.map((_, j) => `${S.names[j]} fold`); go(r.path); });
  }
  function csv() {
    const an = S.an, n = an.node; if (n.t !== 'd') return;
    const rows = [['hand', 'combos', 'reach'].concat(n.acts.map(a => a.label), n.acts.map(a => 'ev_' + a.label), ['ev']).join(',')];
    for (let k = 0; k < 169; k++) rows.push([E.className(k), P.CNT[k], (an.reach[n.p][k] / P.CNT[k]).toFixed(4)].concat(n.acts.map((a, i) => an.strategy[i * 169 + k].toFixed(4)), n.acts.map((a, i) => (an.actEV[i][k] || 0).toFixed(4)), [(an.ev[k] || 0).toFixed(4)]).join(','));
    U.download(`preflop_${S.names[n.p]}_${S.path.join('-') || 'start'}.csv`, rows.join('\n'));
  }
  function init() {
    $('preset').innerHTML = '<option value="">Presets</option>' + Object.keys(PRESETS).map(k => `<option>${esc(k)}</option>`).join('');
    $('preset').onchange = () => { const k = $('preset').value; if (k) loadPreset(PRESETS[k]); $('preset').value = ''; };
    document.querySelectorAll('.panel input, .panel select').forEach(el => { if (!['preset', 'target', 'maxIt'].includes(el.id)) el.addEventListener('change', estimate); });
    loadPreset(PRESETS['Heads-up push or fold, 10 bb']);
    S.grid = new U.Grid($('grid'), { onCell: (k, kind) => { if (!S.an) return; if (kind === 'click') { S.sel = S.sel === k ? -1 : k; renderGrid(); } S.hover = kind === 'leave' ? -1 : k; renderDetail(); } });
    $('btnSolve').onclick = () => solve(true); $('btnResume').onclick = () => solve(false); $('btnStop').onclick = () => { S.solving = false; };
    $('btnCsv').onclick = csv;
    $('viewModes').querySelectorAll('button').forEach(b => b.onclick = () => { S.mode = b.dataset.m; $('viewModes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); if (S.an) renderGrid(); });
    buttons();
  }
  init();
})();
