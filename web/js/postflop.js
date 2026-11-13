/* Postflop solver page: spot and tree set-up, parallel DCFR solve with exploitability tracking, strategy browser
   with EV and equity, node locking and CSV export. */
(function () {
  'use strict';
  const E = PSEngine, U = PSUI, $ = U.$, esc = U.esc, fmt = U.fmt, pct = U.pct;
  const STREET_ROWS = [['flop', 'oop'], ['flop', 'ip'], ['turn', 'oop'], ['turn', 'ip'], ['river', 'oop'], ['river', 'ip']];
  const TREES = {
    'One size per street (fast)': { flop: [['', '', 0], ['33', '', 0]], turn: [['75', '', 0], ['75', '', 0]], river: [['75', '', 0], ['75', '', 0]], maxBets: 2 },
    'Standard': { flop: [['', '50', 0], ['33', '', 0]], turn: [['75', '', 0], ['75', '', 0]], river: [['75', '', 0], ['75', '', 0]], maxBets: 2 },
    'Two flop sizes, raises and all-ins (large)': { flop: [['', '50', 0], ['33,75', '', 0]], turn: [['', '', 0], ['75', '50', 0]], river: [['75', '', 1], ['75', '', 1]], maxBets: 2 },
    'River only, two sizes and all-in': { flop: [['', '', 0], ['', '', 0]], turn: [['', '', 0], ['', '', 0]], river: [['33,75', '100', 1], ['33,75', '100', 1]], maxBets: 3 },
  };
  const SPOTS = {
    'Single-raised pot, button vs big blind, K72 rainbow': { board: 'Ks7d2c', pot: 5.5, stack: 97.5, r: ['BB call vs BTN 2.5x', 'BTN open (100bb)'], tree: 'One size per street (fast)' },
    'Single-raised pot, cutoff vs big blind, T98 two-tone': { board: 'Th9h8c', pot: 5.5, stack: 97.5, r: ['BB call vs CO', 'CO open'], tree: 'One size per street (fast)' },
    '3-bet pot, small blind vs button, A84 two-tone': { board: 'Ad8d4c', pot: 22, stack: 89, r: ['SB 3-bet vs BTN', 'BTN call vs SB 3-bet'], tree: 'Standard' },
    'Turn: K72 rainbow, 5 on the turn': { board: 'Ks7d2c5h', pot: 12, stack: 91, r: ['BB call vs BTN 2.5x', 'BTN open (100bb)'], tree: 'Two flop sizes, raises and all-ins (large)' },
    'River: the talk example': { board: 'Ks7d2cTh4s', pot: 100, stack: 100, r: ['Talk example: BB', 'Talk example: BTN'], tree: 'River only, two sizes and all-in' },
  };
  const S = { pool: null, solving: false, path: [], steps: [], an: null, mode: 'strategy', tabP: 0, hover: -1, sel: -1, hist: [], it: 0,
    locks: new Map(), edit: null, editAct: 0, editFreq: 1, q: Promise.resolve(), classHands: null, t0: 0, cfgKey: '', rangeTab: 0 };
  const queue = fn => (S.q = S.q.then(fn).catch(err => { console.error(err); setStatus('<span class="warn">' + esc(err.message || err) + '</span>'); }));
  const setStatus = h => { $('status').innerHTML = h; };
  const pname = p => p === 0 ? 'OOP' : 'IP';

  // ---------------------------------------------------------------- set-up
  let editors;
  function initSetup() {
    $('spotPreset').innerHTML = '<option value="">Example spots</option>' + Object.keys(SPOTS).map(k => `<option>${esc(k)}</option>`).join('');
    $('rangePreset').innerHTML = '<option value="">Load a preset range</option>' + Object.keys(U.RANGES).map(k => `<option>${esc(k)}</option>`).join('');
    $('treePreset').innerHTML = '<option value="">Presets</option>' + Object.keys(TREES).map(k => `<option>${esc(k)}</option>`).join('');
    const box = $('rangeBox'); box.innerHTML = '<div id="re0"></div><div id="re1" hidden></div>';
    editors = [0, 1].map(p => new U.RangeEditor($('re' + p), { color: `var(--p${p})`, onChange: () => { renderRangeTabs(); scheduleEstimate(); } }));
    let rows = '<tr><th></th><th>Bet sizes</th><th>Raise sizes</th><th>All-in</th></tr>';
    for (const [st, pl] of STREET_ROWS) rows += `<tr data-st="${st}"><td>${st[0].toUpperCase() + st.slice(1)} ${pl.toUpperCase()}</td><td><input type="text" id="b_${st}_${pl}" spellcheck="false"></td><td><input type="text" id="r_${st}_${pl}" spellcheck="false"></td><td class="c"><input type="checkbox" id="a_${st}_${pl}"></td></tr>`;
    $('treeTable').innerHTML = rows;
    $('spotPreset').onchange = () => { const k = $('spotPreset').value; if (k) loadSpot(SPOTS[k]); $('spotPreset').value = ''; };
    $('rangePreset').onchange = () => { const k = $('rangePreset').value; if (k) { editors[S.rangeTab].setText(U.RANGES[k]); renderRangeTabs(); scheduleEstimate(); } $('rangePreset').value = ''; };
    $('treePreset').onchange = () => { const k = $('treePreset').value; if (k) { loadTree(TREES[k]); scheduleEstimate(); } $('treePreset').value = ''; };
    document.querySelectorAll('#treeTable input, #maxBets, #thr, #merge, #pot, #stack, #rakePct, #rakeCap').forEach(el => el.addEventListener('change', scheduleEstimate));
    $('board').addEventListener('input', () => { renderBoard(); scheduleEstimate(); });
    $('target').value = 0.3; $('maxIt').value = 1000; $('every').value = 10;
    $('threads').value = Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4)));
    $('thr').value = 0.67; $('merge').value = 0.1; $('rakePct').value = 0; $('rakeCap').value = 0;
    loadSpot(SPOTS['Single-raised pot, button vs big blind, K72 rainbow']);
  }
  function loadSpot(sp) {
    $('board').value = sp.board; $('pot').value = sp.pot; $('stack').value = sp.stack;
    editors[0].setText(U.RANGES[sp.r[0]]); editors[1].setText(U.RANGES[sp.r[1]]);
    loadTree(TREES[sp.tree]); renderBoard(); renderRangeTabs(); scheduleEstimate();
  }
  function loadTree(t) {
    for (const st of ['flop', 'turn', 'river']) ['oop', 'ip'].forEach((pl, i) => { const [b, r, a] = t[st][i]; $(`b_${st}_${pl}`).value = b; $(`r_${st}_${pl}`).value = r; $(`a_${st}_${pl}`).checked = !!a; });
    $('maxBets').value = t.maxBets;
  }
  function renderRangeTabs() {
    $('rangeTabs').innerHTML = [0, 1].map(p => { let c = 0; for (let k = 0; k < 169; k++) c += editors[p].w[k] * E.CLASS_COMBOS(k);
      return `<button class="tab" type="button" role="tab" data-p="${p}" aria-selected="${S.rangeTab === p}"><span class="dot" style="background:var(--p${p})"></span>${pname(p)}<span class="sub">${fmt(c)}</span></button>`; }).join('');
    $('rangeTabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { S.rangeTab = +b.dataset.p; $('re0').hidden = S.rangeTab !== 0; $('re1').hidden = S.rangeTab !== 1; renderRangeTabs(); });
  }
  function renderBoard() {
    let cards = []; try { cards = U.parseBoard($('board').value); } catch (e) { }
    $('boardCards').innerHTML = cards.map(c => U.cardHtml(c)).join('') + (cards.length >= 3 && cards.length <= 5 ? `<span class="muted">${['Flop', 'Turn', 'River'][cards.length - 3]} spot</span>` : '<span class="warn">Enter three, four or five cards</span>');
    document.querySelectorAll('#treeTable tr[data-st]').forEach(tr => { const st = tr.dataset.st, on = { flop: 3, turn: 4, river: 5 }[st] >= cards.length; tr.style.opacity = on ? 1 : 0.4; });
  }
  const sizes = s => String(s).split(/[,\s]+/).filter(Boolean).map(Number).filter(x => x > 0 && isFinite(x));
  function readCfg() {
    const board = U.parseBoard($('board').value);
    if (board.length < 3 || board.length > 5) throw new Error('The board needs three, four or five cards.');
    if (new Set(board).size !== board.length) throw new Error('The board has a repeated card.');
    const streets = {};
    for (const st of ['flop', 'turn', 'river']) { streets[st] = {}; for (const pl of ['oop', 'ip']) streets[st][pl] = { bet: sizes($(`b_${st}_${pl}`).value), raise: sizes($(`r_${st}_${pl}`).value), allin: $(`a_${st}_${pl}`).checked }; }
    const tree = { streets, maxBets: +$('maxBets').value, allinThreshold: +$('thr').value || 0.67, mergeTolerance: +$('merge').value || 0 };
    const pot = +$('pot').value, stack = +$('stack').value;
    if (!(pot > 0) || !(stack > 0)) throw new Error('Pot and stack must be positive.');
    return { board, pot, stack, ranges: [Float64Array.from(editors[0].w), Float64Array.from(editors[1].w)], tree, rake: { pct: +$('rakePct').value || 0, cap: +$('rakeCap').value || 0 } };
  }
  let estTimer = 0;
  function scheduleEstimate() { clearTimeout(estTimer); estTimer = setTimeout(estimate, 250); }
  /* size of the tree without building all of it: the coordinator's part plus one card's subtree times the number of cards */
  function estimate() {
    try {
      const cfg = readCfg(), top = E.buildGame(cfg, { topOnly: true });
      let dec = top.decisions.length, mem = top.memBytes;
      if (top.top.length) {
        const used = new Set(cfg.board); let c0 = 0; while (used.has(c0)) c0++;
        const own = new Array(52).fill(false); own[c0] = true;
        const one = E.buildGame(cfg, { own }), K = 52 - cfg.board.length;
        dec += (one.decisions.length - top.decisions.length) * K; mem += (one.memBytes - top.memBytes) * K;
      }
      const big = mem > 3e9;
      $('estimate').innerHTML = `Hands in range <b>${top.n[0]}</b> OOP and <b>${top.n[1]}</b> IP. About <b>${dec.toLocaleString()}</b> decision nodes and <b class="${big ? 'warn' : ''}">${mem < 1e7 ? (mem / 1e6).toFixed(2) : (mem / 1e6).toFixed(0)} MB</b> of regrets and strategy sums${big ? ', which is more than most browsers allow. Use fewer sizes' : ''}.`;
      return { dec, mem };
    } catch (e) { $('estimate').innerHTML = `<span class="warn">${esc(e.message)}</span>`; return null; }
  }

  // ---------------------------------------------------------------- solving
  async function build() {
    if (S.pool) { S.pool.terminate(); S.pool = null; }
    const cfg = readCfg();
    setStatus('Building the tree in ' + $('threads').value + ' worker threads...');
    const t0 = performance.now();
    S.pool = await PSPool.Pool.create(cfg, { workers: +$('threads').value || 4, url: 'js/worker.js' });
    S.cfg = cfg; S.hist = []; S.it = 0; S.locks = new Map(); S.path = []; S.steps = []; S.edit = null;
    const g = S.pool.g;
    S.classHands = [0, 1].map(p => { const a = Array.from({ length: 169 }, () => []); for (let i = 0; i < g.n[p]; i++) a[g.cls[p][i]].push(i); return a; });
    $('engineInfo').textContent = `${S.pool.decisions.toLocaleString()} decisions, ${(S.pool.memBytes / 1e6).toFixed(0)} MB, ${S.pool.K} worker${S.pool.K > 1 ? 's' : ''}`;
    S.buildMs = performance.now() - t0;
  }
  async function solve(fresh) {
    if (S.solving) return;
    S.solving = true; setButtons();
    try {
      if (fresh || !S.pool) await build();
      const target = +$('target').value || 0.3, every = Math.max(1, +$('every').value || 10);
      const t0 = performance.now(), it0 = S.it, maxIt = it0 + (+$('maxIt').value || 1000);   // the limit counts from this run's start
      S.forceOne = !fresh;                                                                  // Continue always runs at least one round
      if (!S.hist.length) { const r = await S.pool.evaluate(); S.hist.push([0, r.exploitPct]); }
      while (S.solving && S.it < maxIt) {
        const n = Math.min(every, maxIt - S.it);
        await S.pool.iterate(n); S.it += n;
        const r = await S.pool.evaluate(); S.hist.push([S.it, r.exploitPct]); S.last = r;
        const dt = (performance.now() - t0) / 1000, per = dt / (S.it - it0);
        $('prog').style.width = Math.min(100, 100 * Math.max((S.it - it0) / (maxIt - it0), Math.log(S.hist[0][1] / r.exploitPct) / Math.log(S.hist[0][1] / target))) + '%';
        setStatus(`Iteration <b>${S.it}</b>: exploitability <b>${r.exploitPct.toFixed(3)}%</b> of the pot (${(r.expl).toFixed(4)} chips), target ${target}%. ${(per * 1000).toFixed(0)} ms per iteration including checks. OOP value ${r.val[0].toFixed(3)}, IP value ${r.val[1].toFixed(3)}.`);
        U.lineChart($('chart'), [{ name: 'DCFR', color: 'var(--c-dcfr)', pts: S.hist.filter(p => p[1] > 0) }], { target, ylabel: 'exploitability, % of pot' });
        if (r.exploitPct <= target && !S.forceOne) break;
        S.forceOne = false;
      }
      const r = S.last;
      if (r) setStatus(`${S.solving ? 'Finished' : 'Stopped'} after <b>${S.it}</b> iterations: exploitability <b>${r.exploitPct.toFixed(3)}%</b> of the pot. OOP value ${r.val[0].toFixed(3)}, IP value ${r.val[1].toFixed(3)} chips per hand${S.cfg.rake.pct ? ' after rake' : ''}.`);
    } catch (err) { console.error(err); setStatus('<span class="warn">' + esc(err.message || err) + '</span>'); }
    S.solving = false; setButtons();
    $('browser').hidden = !S.pool;
    if (S.pool) await go(S.path, S.steps);
  }
  function setButtons() { $('btnSolve').disabled = S.solving; $('btnStop').disabled = !S.solving; $('btnResume').disabled = S.solving || !S.pool; }

  // ---------------------------------------------------------------- browsing
  function go(path, steps) {
    return queue(async () => {
      const an = await S.pool.analyse(path);
      if (!an) return;
      S.path = path; S.steps = steps; S.an = an; S.edit = null; S.sel = -1;
      if (an.type === 'd') S.tabP = an.p;
      renderBrowser();
    });
  }
  function stepLabel(st) { return st.card != null ? U.cardText(st.card) : esc(st.label); }
  function renderBrowser() {
    const an = S.an, g = S.pool.g;
    $('navline').innerHTML = `<button type="button" data-k="0" class="${S.path.length ? '' : 'cur'}">Root</button>` + S.steps.map((st, k) => `<span class="sep muted">›</span><button type="button" data-k="${k + 1}" class="${k === S.steps.length - 1 ? 'cur' : ''}">${st.card != null ? '' : pname(st.p) + ' '}${stepLabel(st)}</button>`).join('');
    $('navline').querySelectorAll('button').forEach(b => b.onclick = () => { const k = +b.dataset.k; go(S.path.slice(0, k), S.steps.slice(0, k)); });
    const board = an.board || g.board, pot = an.pot, c = an.c || [0, 0];
    const rngEV = p => { let a = 0, w = 0, e = 0; for (let i = 0; i < g.n[p]; i++) { const m = an.reach[p][i] * an.ev[p].mass[i]; if (m > 0 && isFinite(an.ev[p].ev[i])) { a += m * an.ev[p].ev[i]; e += m * an.equity[p][i]; w += m; } } return [w ? a / w : NaN, w ? e / w : NaN]; };
    const r0 = rngEV(0), r1 = rngEV(1);
    const who = an.type === 'd' ? `<b>${pname(an.p)}</b> to act` : an.type === 'c' ? '<b>Card to come</b>' : an.type === 'f' ? '<b>Fold</b>, hand over' : '<b>Showdown</b>';
    const locked = S.locks.has(S.path.join(','));
    $('nodehead').innerHTML = `<span>${who} ${locked ? '<span class="lockedtag">locked</span>' : ''}</span><span>Board ${board.map(U.cardText).join('')}</span><span>Pot <b>${fmt(pot)}</b></span><span>Behind ${fmt(S.cfg.stack - c[0])} / ${fmt(S.cfg.stack - c[1])}</span>` +
      `<span class="muted">OOP range EV ${fmt2(r0[0])}, equity ${pct(r0[1])} · IP range EV ${fmt2(r1[0])}, equity ${pct(r1[1])}</span>`;
    const box = $('actions'); box.innerHTML = ''; $('chancebox').innerHTML = '';
    if (an.type === 'd') {
      const cols = U.actionColors(an.acts);
      box.innerHTML = an.acts.map((a, i) => `<button class="act" type="button" data-i="${i}"><span class="sw" style="background:${cols[i]}"></span><span class="nm">${esc(a.label)}</span><span class="fq">${pct(an.freq[i])}</span><span class="meter" style="width:${100 * an.freq[i]}%;background:${cols[i]}"></span></button>`).join('');
      box.querySelectorAll('.act').forEach(b => b.onclick = () => { const i = +b.dataset.i; go(S.path.concat([i]), S.steps.concat([{ p: an.p, label: an.acts[i].label }])); });
    } else if (an.type === 'c') {
      const avail = new Set(an.cards); let h = '<div class="cardpick">';
      for (let s = 3; s >= 0; s--) for (let r = 12; r >= 0; r--) { const cc = r * 4 + s; h += U.cardHtml(cc, 'button', '').replace('<button', `<button ${avail.has(cc) ? '' : 'disabled'}`); }
      $('chancebox').innerHTML = h + '</div><p class="hint">Choose the next card. Strategies below each card are solved for that card; the grid above shows the ranges arriving at this chance node.</p>';
      $('chancebox').querySelectorAll('button.pcard:not(:disabled)').forEach(b => b.onclick = () => { const cc = +b.dataset.c; go(S.path.concat([cc]), S.steps.concat([{ card: cc }])); });
    }
    $('pTabs').innerHTML = [0, 1].map(p => `<button class="tab" type="button" role="tab" data-p="${p}" aria-selected="${S.tabP === p}"><span class="dot" style="background:var(--p${p})"></span>${pname(p)}${an.type === 'd' && an.p === p ? '<span class="sub">to act</span>' : ''}</button>`).join('');
    $('pTabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { S.tabP = +b.dataset.p; renderBrowser(); });
    renderGrid(); renderDetail(); renderLock();
  }
  const fmt2 = x => isFinite(x) ? x.toFixed(2) : 'n/a';
  function strat() { return S.edit || S.an.strategy; }
  /* per class: weight, action mix, EV, equity of player p */
  function classStats(p) {
    const an = S.an, acting = an.type === 'd' && an.p === p, na = acting ? an.acts.length : 0, sg = acting ? strat() : null, out = [];
    for (let k = 0; k < 169; k++) {
      const hs = S.classHands[p][k]; let w = 0, wm = 0, ev = 0, eq = 0; const mix = new Float64Array(na);
      for (const h of hs) { const r = an.reach[p][h]; w += r; const m = r * an.ev[p].mass[h]; if (m > 0 && isFinite(an.ev[p].ev[h])) { wm += m; ev += m * an.ev[p].ev[h]; eq += m * an.equity[p][h]; } if (acting) for (let a = 0; a < na; a++) mix[a] += r * sg[h * na + a]; }
      out.push({ n: hs.length, w, frac: hs.length ? w / hs.length : 0, mix: w > 0 ? Array.from(mix, x => x / w) : null, ev: wm ? ev / wm : NaN, eq: wm ? eq / wm : NaN });
    }
    return out;
  }
  function renderGrid() {
    const an = S.an, p = S.tabP, st = classStats(p), acting = an.type === 'd' && an.p === p, cols = acting ? U.actionColors(an.acts) : null;
    const evs = st.filter(s => s.frac > 0.004 && isFinite(s.ev)).map(s => s.ev), lo = Math.min(...evs, 0), hi = Math.max(...evs, 1);
    let tot = acting ? new Float64Array(an.acts.length) : null, totw = 0;
    for (let k = 0; k < 169; k++) {
      const s = st[k], on = s.frac > 0.004; let segs, label = '', cls = (k === S.sel ? 'sel' : '');
      if (S.mode === 'strategy' && acting && s.mix) { segs = s.mix.map((x, a) => ({ w: x, c: cols[a] })); s.mix.forEach((x, a) => tot[a] += x * s.w); totw += s.w; }
      else if (S.mode === 'ev' && on) { const a = Math.min(lo, -hi), z = Math.max(hi, -lo); segs = [{ w: 1, c: U.heat(s.ev, a, z) }]; label = isFinite(s.ev) ? s.ev.toFixed(1) : ''; cls += U.heatLight(s.ev, a, z) ? ' heatl' : ' heat'; }
      else if (S.mode === 'equity' && on) { segs = [{ w: 1, c: U.heat(s.eq, 0, 1) }]; label = isFinite(s.eq) ? Math.round(100 * s.eq) : ''; cls += U.heatLight(s.eq, 0, 1) ? ' heatl' : ' heat'; }
      else segs = [{ w: 1, c: `var(--p${p})` }];
      S.grid.set(k, on ? (S.mode === 'strategy' || S.mode === 'range' ? s.frac : 1) : 0, segs, cls, label);
    }
    S.grid.painting = !!S.edit;
    S.grid.el.classList.toggle('edit', !!S.edit);
    if (S.mode === 'strategy' && acting) {
      // frequencies over the deals that reach this node (hands weighted by the compatible opponent weight)
      const fr = S.edit ? editFreq() : an.freq;
      $('legend').innerHTML = an.acts.map((a, i) => `<span><i style="background:${cols[i]}"></i>${esc(a.label)} ${pct(fr[i])}</span>`).join('');
      $('rangebar').hidden = false; $('rangebar').innerHTML = an.acts.map((a, i) => `<i style="width:${100 * fr[i]}%;background:${cols[i]}"></i>`).join('');
    } else {
      $('rangebar').hidden = true;
      $('legend').innerHTML = S.mode === 'ev' ? '<span>Expected value of each hand from here, in chips, counting its own money in the pot. Blue is low, red is high.</span>'
        : S.mode === 'equity' ? '<span>Equity of each hand against the opponent range at this point, averaged over the cards to come.</span>'
        : `<span><i style="background:var(--p${p})"></i>Share of each hand of ${pname(p)} that reaches this point.</span>`;
    }
  }
  function editFreq() {
    const an = S.an, p = an.p, na = an.acts.length, fr = new Float64Array(na); let tot = 0;
    for (let i = 0; i < S.pool.g.n[p]; i++) { const w = an.reach[p][i] * an.ev[p].mass[i]; tot += w; for (let a = 0; a < na; a++) fr[a] += w * S.edit[i * na + a]; }
    return Array.from(fr, x => tot > 0 ? x / tot : 0);
  }
  function renderDetail() {
    const an = S.an, g = S.pool.g, p = S.tabP, k = S.hover >= 0 ? S.hover : S.sel, box = $('detail');
    if (k < 0) { box.innerHTML = '<p class="muted">Point at a square to see each combination: its weight here, its strategy, its EV in chips and its equity.</p>'; return; }
    const acting = an.type === 'd' && an.p === p, na = acting ? an.acts.length : 0, cols = acting ? U.actionColors(an.acts) : null, sg = acting ? strat() : null;
    let h = `<h3>${E.className(k)} <span class="muted" style="font-weight:400">${pname(p)}</span></h3><table><tr><th>Combo</th><th>Weight</th>${acting ? '<th>Strategy</th>' : ''}<th>EV</th><th>Equity</th></tr>`;
    for (const i of S.classHands[p][k]) {
      const r = an.reach[p][i]; if (r < 1e-9) { h += `<tr><td>${U.comboText(g.L[p][i])}</td><td class="muted" colspan="${acting ? 4 : 3}">not in range here</td></tr>`; continue; }
      const bar = acting ? `<span class="mini">${Array.from({ length: na }, (_, a) => `<i style="width:${100 * sg[i * na + a]}%;background:${cols[a]}"></i>`).join('')}</span>` : '';
      h += `<tr><td>${U.comboText(g.L[p][i])}</td><td>${r.toFixed(2)}</td>${acting ? `<td title="${an.acts.map((a, j) => a.label + ' ' + pct(sg[i * na + j])).join(', ')}">${bar}</td>` : ''}<td>${fmt2(an.ev[p].ev[i])}</td><td>${pct(an.equity[p][i])}</td></tr>`;
    }
    box.innerHTML = h + '</table>' + (acting ? `<p class="muted" style="margin:6px 0 0">${an.acts.map((a, j) => `<span style="color:${cols[j]}">■</span> ${esc(a.label)}`).join(' &nbsp;')}</p>` : '');
  }
  // ---------------------------------------------------------------- node locking
  function renderLock() {
    const an = S.an, box = $('lockbox');
    if (an.type !== 'd' || S.solving) { box.innerHTML = ''; return; }
    const key = S.path.join(','), locked = S.locks.has(key), cols = U.actionColors(an.acts);
    const list = [...S.locks.entries()].map(([k, v]) => `<li>${esc(v)} <button class="btn small" type="button" data-unlock="${k}">unlock</button></li>`).join('');
    box.innerHTML = `<details class="setup" ${S.edit || locked ? 'open' : ''} style="margin-top:12px"><summary>Node locking</summary>
      <p class="hint" style="margin-top:0">Fix the strategy of ${pname(an.p)} at this node, then continue solving: the other player adapts to the locked strategy and every other node is re-solved. Edit by choosing an action and a frequency, then painting squares on the grid.</p>
      <div class="editbar">${S.edit ? an.acts.map((a, i) => `<button class="btn small" type="button" data-ea="${i}" aria-pressed="${S.editAct === i}"><span style="color:${cols[i]}">■</span> ${esc(a.label)}</button>`).join('') +
        `<label class="f" style="flex-direction:row;align-items:center;gap:6px">frequency <input type="range" id="efreq" min="0" max="1" step="0.05" value="${S.editFreq}"> <span id="efv">${pct(S.editFreq, 0)}</span></label>` : ''}</div>
      <div class="rowbtns">${S.edit ? '<button class="btn primary small" type="button" id="btnLock">Lock this strategy</button><button class="btn small" type="button" id="btnCancelEdit">Cancel</button>'
        : `<button class="btn small" type="button" id="btnEdit">Edit and lock</button><button class="btn small" type="button" id="btnLockAsIs">Lock as solved</button>${locked ? '<button class="btn small" type="button" id="btnUnlock">Unlock</button>' : ''}`}</div>
      ${list ? `<ul class="locks">${list}</ul><p class="hint">Press Continue to re-solve with the locks.</p>` : ''}</details>`;
    const on = (id, f) => { const el = box.querySelector('#' + id); if (el) el.onclick = f; };
    on('btnEdit', () => { S.edit = Float64Array.from(an.strategy); renderGrid(); renderLock(); });
    on('btnCancelEdit', () => { S.edit = null; renderGrid(); renderDetail(); renderLock(); });
    on('btnLock', () => doLock(S.edit));
    on('btnLockAsIs', () => doLock(an.strategy));
    on('btnUnlock', () => doUnlock(key));
    box.querySelectorAll('[data-ea]').forEach(b => b.onclick = () => { S.editAct = +b.dataset.ea; renderLock(); });
    box.querySelectorAll('[data-unlock]').forEach(b => b.onclick = () => doUnlock(b.dataset.unlock));
    const fr = box.querySelector('#efreq'); if (fr) fr.oninput = () => { S.editFreq = +fr.value; box.querySelector('#efv').textContent = pct(S.editFreq, 0); };
  }
  function paintClass(k) {
    if (!S.edit) return;
    const an = S.an, na = an.acts.length, a0 = S.editAct, f = S.editFreq;
    for (const i of S.classHands[an.p][k]) {
      const row = S.edit.subarray(i * na, i * na + na); let rest = 0; for (let a = 0; a < na; a++) if (a !== a0) rest += row[a];
      for (let a = 0; a < na; a++) row[a] = a === a0 ? f : rest > 1e-9 ? row[a] / rest * (1 - f) : (1 - f) / (na - 1);
    }
    renderGrid(); S.hover = k; renderDetail();
  }
  function doLock(st) {
    const path = S.path.slice(), label = (S.steps.length ? S.steps.map(s => s.card != null ? E.cardStr(s.card) : pname(s.p) + ' ' + s.label).join(' › ') : 'Root') + ` (${pname(S.an.p)})`;
    queue(async () => { const ok = await S.pool.lock(path, Float64Array.from(st)); if (ok) S.locks.set(path.join(','), label); S.edit = null; })
      .then(() => go(S.path, S.steps)).then(() => setStatus(`Locked ${esc(label)}. Press Continue to re-solve the rest of the tree against it.`));
  }
  function doUnlock(key) {
    const path = key ? key.split(',').map(Number) : [];
    queue(async () => { await S.pool.lock(path, null); S.locks.delete(key); }).then(() => go(S.path, S.steps));
  }
  function exportCsv() {
    const an = S.an, g = S.pool.g, p = S.tabP, acting = an.type === 'd' && an.p === p, na = acting ? an.acts.length : 0, sg = acting ? strat() : null;
    const head = ['combo', 'class', 'weight'].concat(acting ? an.acts.map(a => a.label) : [], ['ev', 'equity']);
    const rows = [head.join(',')];
    for (let i = 0; i < g.n[p]; i++) {
      const k = g.L[p][i], r = an.reach[p][i]; if (r < 1e-9) continue;
      rows.push([E.cardStr(E.COMBO_A[k]) + E.cardStr(E.COMBO_B[k]), E.className(g.cls[p][i]), r.toFixed(4)].concat(acting ? Array.from({ length: na }, (_, a) => sg[i * na + a].toFixed(4)) : [], [an.ev[p].ev[i].toFixed(4), an.equity[p][i].toFixed(4)]).join(','));
    }
    U.download(`strategy_${pname(p)}_${S.path.join('-') || 'root'}.csv`, rows.join('\n'));
  }

  function init() {
    initSetup(); setButtons();
    S.grid = new U.Grid($('grid'), {
      onCell: (k, kind) => { if (kind === 'click') { S.sel = S.sel === k ? -1 : k; renderGrid(); } S.hover = kind === 'leave' ? -1 : k; if (S.an) renderDetail(); },
      onPaint: k => paintClass(k),
    });
    $('btnSolve').onclick = () => solve(true);
    $('btnResume').onclick = () => solve(false);
    $('btnStop').onclick = () => { S.solving = false; };
    $('btnCsv').onclick = exportCsv;
    $('viewModes').querySelectorAll('button').forEach(b => b.onclick = () => { S.mode = b.dataset.m; $('viewModes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderGrid(); });
    window.addEventListener('resize', () => { if (S.hist.length) U.lineChart($('chart'), [{ name: 'DCFR', color: 'var(--c-dcfr)', pts: S.hist }], { target: +$('target').value, ylabel: 'exploitability, % of pot' }); });
  }
  init();
})();
