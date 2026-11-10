/* River Solver Table: interface. All solving is done by solver.js on the main thread in short time slices. */
(function () {
  'use strict';
  const P = PokerSolver, $ = id => document.getElementById(id);
  const SUIT_PATH = {
    h: '<path d="M50 90C20 64 8 47 8 31C8 17 19 8 30 8c9 0 16 5 20 12c4-7 11-12 20-12c11 0 22 9 22 23c0 16-12 33-42 59z"/>',
    d: '<path d="M50 5L87 50L50 95L13 50z"/>',
    s: '<path d="M50 5C62 26 91 42 91 63c0 12-9 20-20 20c-7 0-13-3-17-9c1 9 4 16 10 21H36c6-5 9-12 10-21c-4 6-10 9-17 9C18 83 9 75 9 63C9 42 38 26 50 5z"/>',
    c: '<circle cx="50" cy="27" r="20"/><circle cx="27" cy="58" r="20"/><circle cx="73" cy="58" r="20"/><path d="M41 40h18v28H41zM50 60c0 16-4 28-13 35h26c-9-7-13-19-13-35z"/>' };
  const SYM = {}; for (const k in SUIT_PATH) SYM[k] = `<svg class="su" viewBox="0 0 100 100" aria-hidden="true">${SUIT_PATH[k]}</svg>`;
  const COL = { fold: '#4A78B5', pass: '#3A9A6B', b1: '#F2A07B', b2: '#D9573F', b3: '#8C1C24' };
  const ALGO_VAR = { cfr: 'var(--c-cfr)', 'cfr+': 'var(--c-cfrp)', dcfr: 'var(--c-dcfr)', 'pcfr+': 'var(--c-pcfr)' };
  const ALGO_KEYS = ['cfr', 'cfr+', 'dcfr', 'pcfr+'];
  const PRESETS = [
    ['Big blind calling range (talk)', P.BB_CALL], ['Button opening range (talk)', P.BTN_OPEN],
    ['Every hand', '22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,82s+,72s+,62s+,52s+,42s+,32s,A2o+,K2o+,Q2o+,J2o+,T2o+,92o+,82o+,72o+,62o+,52o+,42o+,32o'],
    ['Pairs and big cards', '22+,ATs+,KTs+,QTs+,JTs,ATo+,KTo+,QTo+,JTo'],
    ['Strong hands or nothing', 'TT+,AKs,AKo,KTs,KTo,65s,54s,86s,97s,J9s,Q9s']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = x => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
  const pct = (x, d) => isFinite(x) ? (100 * x).toFixed(d == null ? 1 : d) + '%' : 'n/a';
  const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)); const A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const sci = x => x === 0 ? '0' : x >= 1 ? x.toFixed(2) : x >= 1e-5 ? x.toFixed(Math.min(8, 1 - Math.floor(Math.log10(x)))) : x.toExponential(1);

  function talkCfg() {
    return { names: ['Big blind', 'Button'], board: ['Ks', '7d', '2c', 'Th', '4s'].map(P.cardOf), pot: 100, stack: 100,
      bets: [[33, 75], [33, 75]], raises: [100], maxRaises: 2, weights: [P.parseRange(P.BB_CALL), P.parseRange(P.BTN_OPEN)] };
  }
  const S = { cfg: talkCfg(), g: null, solvers: {}, algo: 'dcfr', target: 1000, path: [], node: null, hole: [-1, -1], tab: 0, edit: false, brush: 1,
    sel: -1, hover: -1, treeMode: 'all', strat: null, view: null, prob: null, mass: null, classHands: null, error: '' };
  let job = null, rebuildTimer = 0;

  // ---------- cards ----------
  function cardHtml(c, tag, extra) {
    const s = P.SUITS[c & 3];
    return `<${tag || 'span'} class="pcard c-${s} ${extra || ''}" ${tag === 'button' ? 'type="button"' : ''} data-c="${c}" aria-label="${P.RANKS[c >> 2]} of ${{ c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' }[s]}"><span class="r">${P.RANKS[c >> 2]}</span><span class="u">${SYM[s]}</span></${tag || 'span'}>`;
  }
  const backHtml = () => '<span class="pcard back"></span>';
  const handText = h => [S.g.cb[h], S.g.ca[h]].map(c => `<span class="c-${P.SUITS[c & 3]}" style="font-weight:600">${P.RANKS[c >> 2]}${SYM[P.SUITS[c & 3]]}</span>`).join('');

  // ---------- game and solvers ----------
  function buildGame(autoSolve) {
    stopJob();
    const c = S.cfg;
    S.error = '';
    let g;
    try {
      g = P.createGame({ board: c.board, pot: c.pot, stack: c.stack, bets: c.bets.map(a => a.map(x => x / 100)), raises: c.raises.map(x => x / 100),
        maxRaises: c.maxRaises, weights: c.weights });
    } catch (e) { S.error = 'This spot could not be built. Check the numbers in the setup.'; return; }
    S.g = g;
    S.classHands = Array.from({ length: 169 }, () => []);
    for (let h = 0; h < g.N; h++) S.classHands[g.cls[h]].push(h);
    S.solvers = {}; for (const a of ALGO_KEYS) S.solvers[a] = new P.Solver(g, a);
    S.path = []; S.node = g.root; S.hole = [-1, -1]; S.sel = -1; S.hover = -1;
    if (!(g.Z > 0)) { S.error = 'One of the ranges is empty, or the two ranges cannot be dealt together on this board.'; }
    refreshView(); renderAll(); renderChart();
    if (autoSolve && !S.error) startJob([S.algo], S.target);
  }
  function scheduleRebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => buildGame(true), 350); }
  function refreshView() {
    const g = S.g, sol = S.solvers[S.algo];
    S.strat = sol.average();
    S.view = P.analyse(g, S.strat);
    S.prob = g.nodes.map(n => { const m = P.oppMass(g, S.view[n.id].reach[1]), r = S.view[n.id].reach[0]; let s = 0; for (let h = 0; h < g.N; h++) s += r[h] * m[h]; return g.Z > 0 ? s / g.Z : 0; });
    refreshNode();
  }
  function refreshNode() { const v = S.view[S.node.id]; S.mass = [P.oppMass(S.g, v.reach[1]), P.oppMass(S.g, v.reach[0])]; }
  const CHECK = t => { if (t <= 10) return true; const m = Math.pow(10, Math.floor(Math.log10(t) + 1e-9)); return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8].indexOf(+(t / m).toFixed(4)) >= 0; };
  function startJob(algos, target) {
    stopJob();
    if (S.error) return;
    job = { algos, target, last: 0 };
    tick();
  }
  function stopJob() { if (job) { clearTimeout(job.timer); job = null; } }
  function tick() {
    if (!job) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 40) {
      let best = null;
      for (const a of job.algos) { const s = S.solvers[a]; if (s.t < job.target && (!best || s.t < best.t)) best = s; }
      if (!best) break;
      const a0 = performance.now(); best.step(); best.time += performance.now() - a0;
      if (CHECK(best.t) || best.t === job.target) best.hist.push([best.t, best.exploitability()]);
    }
    const done = job.algos.every(a => S.solvers[a].t >= job.target), now = performance.now();
    if (done) job = null;
    if (done || now - job.last > 200) { if (job) job.last = now; refreshView(); renderAll(); renderChart(); }
    if (job) job.timer = setTimeout(tick, 0);
  }

  // ---------- quantities shown ----------
  const actShort = a => a.kind === 'check' ? 'check' : a.kind === 'fold' ? 'fold' : a.kind === 'call' ? 'call' : a.kind === 'bet' ? 'bet ' + fmt(a.amount) : a.kind === 'raise' ? 'raise to ' + fmt(a.amount) : 'all-in ' + fmt(a.amount);
  const actLong = a => a.kind === 'check' ? 'Check' : a.kind === 'fold' ? 'Fold' : a.kind === 'call' ? 'Call ' + fmt(a.amount) : a.kind === 'bet' ? 'Bet ' + fmt(a.amount) : a.kind === 'raise' ? 'Raise to ' + fmt(a.amount) : 'All-in ' + fmt(a.amount);
  function actColors(node) {
    const mid = node.actions.map((a, i) => i).filter(i => node.actions[i].kind === 'bet' || node.actions[i].kind === 'raise');
    return node.actions.map((a, i) => a.kind === 'fold' ? COL.fold : (a.kind === 'check' || a.kind === 'call') ? COL.pass : a.kind === 'allin' ? COL.b3
      : mix(COL.b1, COL.b2, mid.length === 1 ? 0.6 : mid.indexOf(i) / (mid.length - 1)));
  }
  const actFreq = (node, a) => S.prob[node.id] > 1e-12 ? S.prob[node.children[a].id] / S.prob[node.id] : NaN;
  function handEV(node, p, h, mass) { const m = mass[h]; return m > 1e-12 ? S.view[node.id].ev[p][h] / m + S.g.pot / 2 : NaN; }
  function rangeEV(node, p, mass, wsel) {
    const r = S.view[S.node.id].reach[p], ev = S.view[node.id].ev[p]; let a = 0, b = 0;
    for (let h = 0; h < S.g.N; h++) { const w = wsel ? wsel(h) : r[h]; a += w * ev[h]; b += w * mass[h]; }
    return b > 1e-12 ? a / b + S.g.pot / 2 : NaN;
  }
  const potNow = n => S.g.pot + n.contrib[0] + n.contrib[1];
  const nm = p => S.cfg.names[p] || (p ? 'In position' : 'Out of position');
  function lineOf(node) { const out = []; for (let n = node; n.parent; n = n.parent) out.unshift(n.pa); return out; }
  function goNode(node) { S.path = lineOf(node); S.node = node; refreshNode(); renderAll(); }
  function act(a) { if (S.node.type !== 'd') return; S.tab = S.node.children[a].type === 'd' ? S.node.children[a].player : S.tab; goNode(S.node.children[a]); }

  // ---------- table ----------
  function renderTable() {
    const g = S.g, n = S.node, c = S.cfg;
    $('board').innerHTML = c.board.map((x, i) => cardHtml(x, 'button', '').replace('data-c=', `data-i="${i}" title="Change this board card" data-c=`)).join('');
    const st = [c.stack - n.contrib[0], c.stack - n.contrib[1]];
    $('potline').textContent = `pot = ${fmt(potNow(n))}, stacks = ${st[0] === st[1] ? fmt(st[0]) : fmt(st[0]) + ' and ' + fmt(st[1])}`;
    for (let p = 0; p < 2; p++) {
      const h = S.hole[p], seat = $('seat' + p);
      seat.className = `seat seat${p}` + (n.type === 'd' && n.player === p ? ' acting' : '');
      seat.innerHTML = `<button class="hole" type="button" data-p="${p}" title="Choose this player's cards">${h >= 0 ? cardHtml(g.cb[h]) + cardHtml(g.ca[h]) : backHtml() + backHtml()}</button>`
        + `<div class="lbl">${p === 1 ? '<span class="dealer" title="Dealer button">D</span>' : ''}<span class="nm">${esc(nm(p))} (${p ? 'IP' : 'OOP'})</span><span class="stack">${fmt(st[p])}</span></div>`;
      // what this player last did
      let said = '';
      for (let k = n; k.parent; k = k.parent) if (k.parent.player === p) { said = actShort(k.parent.actions[k.pa]); break; }
      $('wager' + p).innerHTML = (said ? `<span class="said">${esc(said)}</span>` : '') + (n.contrib[p] > 0 ? `<span><span class="chip"></span> <span class="num">${fmt(n.contrib[p])} in</span></span>` : '');
    }
    const res = $('result');
    if (n.type === 'd') res.hidden = true; else { res.hidden = false; res.textContent = resultText(n, true); }
    $('spotline').innerHTML = `Board ${c.board.map(x => P.RANKS[x >> 2] + SYM[P.SUITS[x & 3]]).join(' ')} · pot ${fmt(c.pot)} · stacks ${fmt(c.stack)} · ${g.nLive[0]} against ${g.nLive[1]} hands`;
  }
  function showdownEquity(n) {
    const r = S.view[n.id].reach[0], ev = S.view[n.id].ev[0], m = S.mass[0]; let a = 0, b = 0;
    for (let h = 0; h < S.g.N; h++) { a += r[h] * ev[h]; b += r[h] * m[h]; }
    return b > 1e-12 ? (a / b / n.amount + 1) / 2 : NaN;
  }
  function resultText(n, short) {
    const g = S.g, total = potNow(n);
    if (n.type === 'fold') { const w = 1 - n.folder; return `${nm(n.folder)} folds and ${nm(w)} wins the pot of ${fmt(total)}`; }
    const [a, b] = S.hole;
    if (a >= 0 && b >= 0) {
      if (g.key[a] === g.key[b]) return `Showdown: the pot of ${fmt(total)} is split`;
      const w = g.key[a] > g.key[b] ? 0 : 1;
      return `Showdown: ${nm(w)} wins ${fmt(total)} with ${P.categoryOf(g.key[w ? b : a])}`;
    }
    const eq = showdownEquity(n);
    return short ? `Showdown for a pot of ${fmt(total)}` : `Showdown for a pot of ${fmt(total)}. With the ranges that reach this point, ${nm(0)} wins ${pct(eq, 0)} of the time and ${nm(1)} wins ${pct(1 - eq, 0)}.`;
  }
  function renderCrumbs() {
    let n = S.g.root, html = `<button type="button" data-d="0" class="${S.path.length ? '' : 'cur'}">Start of the river</button>`;
    S.path.forEach((a, i) => {
      html += `<span class="sep">›</span><button type="button" data-d="${i + 1}" class="${i === S.path.length - 1 ? 'cur' : ''}">${esc(nm(n.player))} ${esc(actShort(n.actions[a]))}</button>`;
      n = n.children[a];
    });
    $('crumbs').innerHTML = html;
  }
  function renderActions() {
    const n = S.node, box = $('actions'), note = $('undernote');
    $('btnBack').disabled = $('btnRestart').disabled = !S.path.length;
    $('btnSample').disabled = n.type !== 'd';
    if (S.error) { box.innerHTML = ''; note.textContent = S.error; return; }
    if (n.type !== 'd') { box.innerHTML = ''; note.textContent = resultText(n, false) + '. Use the buttons below to go back.'; return; }
    const p = n.player, h = S.hole[p], cols = actColors(n), inRange = h >= 0 && S.view[n.id].reach[p][h] > 1e-9;
    box.innerHTML = n.actions.map((a, i) => {
      const f = actFreq(n, i);
      let l2 = `whole range ${pct(f)}`;
      if (h >= 0) l2 += inRange ? `<br>this hand ${pct(S.strat[n.di][h * n.na + i])}, EV ${fmt1(handEV(n.children[i], p, h, S.mass[p]))}` : '';
      return `<button class="act" type="button" data-a="${i}"><span class="sw" style="background:${cols[i]}"></span><span class="nm">${actLong(a)}${a.frac && a.kind !== 'allin' ? ` <span class="muted" style="font-weight:400">${Math.round(a.frac * 100)}% pot</span>` : ''}</span><span class="fq">${l2}</span><span class="meter" style="width:${isFinite(f) ? 100 * f : 0}%;background:${cols[i]}"></span></button>`;
    }).join('');
    const sol = S.solvers[S.algo];
    let t = `<b>${esc(nm(p))}</b> is to act with ${fmt(S.cfg.stack - n.contrib[p])} behind` + (n.facing ? ` and has to put in ${fmt(n.contrib[1 - p] - n.contrib[p])} to call. ` : '. ');
    if (!sol.t) t += 'The solver has not run yet, so every action is shown with equal weight.';
    else if (h >= 0 && !inRange) t += 'The cards chosen for this player are not in the range that reaches this point, so only the whole-range numbers are shown.';
    else t += 'Click an action to play it. The numbers show how often the solved strategy takes each action.';
    note.innerHTML = t;
  }
  const fmt1 = x => isFinite(x) ? (Math.abs(x) < 0.05 ? '0.0' : x.toFixed(1)) : 'n/a';

  // ---------- range grid ----------
  function initGrid() {
    let html = '';
    for (let k = 0; k < 169; k++) html += `<div class="cell" data-k="${k}"><div class="fill"></div><span class="t">${P.className(k)}</span></div>`;
    $('grid').innerHTML = html;
  }
  function renderTabs() {
    const n = S.node;
    $('tabs').innerHTML = [0, 1].map(p => {
      let tot = 0; const r = S.view[n.id].reach[p]; for (let h = 0; h < S.g.N; h++) tot += r[h];
      return `<button class="tab" role="tab" type="button" data-p="${p}" aria-selected="${S.tab === p}"><span class="dot" style="background:var(--p${p})"></span>${esc(nm(p))}<span class="sub">${n.type === 'd' && n.player === p ? 'to act · ' : ''}${fmt(tot)} hands</span></button>`;
    }).join('');
  }
  function renderGrid() {
    const g = S.g, n = S.node, p = S.tab, cells = $('grid').children;
    const acting = !S.edit && n.type === 'd' && n.player === p, cols = acting ? actColors(n) : null, na = n.na;
    const r = S.edit ? g.w[p] : S.view[n.id].reach[p], sig = acting ? S.strat[n.di] : null;
    const tot = acting ? new Float64Array(na) : null;
    const hl = S.hole[p] >= 0 ? g.cls[S.hole[p]] : -1;
    $('grid').classList.toggle('edit', S.edit);
    for (let k = 0; k < 169; k++) {
      const hs = S.classHands[k], cell = cells[k], fill = cell.firstChild;
      let sum = 0; const seg = acting ? new Float64Array(na) : null;
      for (const h of hs) { sum += r[h]; if (acting) for (let a = 0; a < na; a++) seg[a] += r[h] * sig[h * na + a]; }
      const frac = hs.length ? sum / hs.length : 0;
      cell.className = 'cell' + (frac > 0.004 ? ' on' : '') + (k === S.sel ? ' sel' : '') + (k === hl ? ' hl' : '');
      fill.style.height = (frac > 0.004 ? Math.max(8, 100 * frac) : 0) + '%';
      if (acting && sum > 0) {
        let html = ''; for (let a = 0; a < na; a++) { tot[a] += seg[a]; if (seg[a] / sum > 0.002) html += `<i style="width:${(100 * seg[a] / sum).toFixed(2)}%;background:${cols[a]}"></i>`; }
        fill.innerHTML = html;
      } else fill.innerHTML = `<i style="width:100%;background:var(--p${p})"></i>`;
    }
    // legend and the bar for the whole range
    const leg = $('legend'), bar = $('rangebar');
    if (acting) {
      leg.innerHTML = n.actions.map((a, i) => `<span><i style="background:${cols[i]}"></i>${actLong(a)} ${pct(actFreq(n, i))}</span>`).join('');
      bar.hidden = false; bar.innerHTML = n.actions.map((a, i) => { const f = actFreq(n, i); return f > 0.001 ? `<i style="width:${100 * f}%;background:${cols[i]}"></i>` : ''; }).join('');
    } else {
      leg.innerHTML = `<span><i style="background:var(--p${p})"></i>${S.edit ? 'Share of each hand in the starting range' : 'Share of each hand still in the range at this point'}</span>`;
      bar.hidden = true;
    }
    $('gridhint').textContent = S.edit ? 'Click or drag over the squares to paint the starting range. The spot is solved again as soon as you stop.'
      : acting ? 'Each square is one kind of starting hand, with suited hands above the diagonal and offsuit hands below it. The height of the colour is how much of that hand is still in the range, and the colours split it between the actions.'
      : 'This player is not the one to act here, so the grid shows how much of each hand is still in the range after the actions so far.';
  }
  function renderDetail() {
    const g = S.g, n = S.node, p = S.tab, k = S.hover >= 0 ? S.hover : S.sel, box = $('detail');
    if (S.edit) { box.innerHTML = '<p class="muted">Editing the starting range. Leave edit mode to see the strategy.</p>'; return; }
    const v = S.view[n.id], r = v.reach[p], acting = n.type === 'd' && n.player === p, cols = acting ? actColors(n) : null, na = n.na;
    if (k < 0) {
      let tot = 0, start = 0; for (let h = 0; h < g.N; h++) { tot += r[h]; start += g.w[p][h]; }
      let html = `<h3>${esc(nm(p))}: whole range</h3><p class="muted" style="margin:0 0 6px">${fmt(tot)} of ${fmt(start)} starting hands reach this point. Average value ${fmt1(rangeEV(n, p, S.mass[p]))} chips.</p>`;
      if (acting) {
        html += '<table><tr><th>Action</th><th>How often</th><th>Value</th></tr>' + n.actions.map((a, i) => {
          const sig = S.strat[n.di]; const ev = rangeEV(n.children[i], p, S.mass[p], h => r[h] * sig[h * na + i]);
          return `<tr><td><span class="mini" style="width:10px"><i style="width:100%;background:${cols[i]}"></i></span> ${actLong(a)}</td><td>${pct(actFreq(n, i))}</td><td>${fmt1(ev)}</td></tr>`;
        }).join('') + '</table>';
      }
      html += '<p class="muted" style="margin:8px 0 0">Values are in chips won by the end of the hand, counted from the start of the river. Hover over a square, or click it, to see its individual hands.</p>';
      box.innerHTML = html; return;
    }
    const hs = S.classHands[k].filter(h => g.w[p][h] > 0);
    let html = `<h3>${P.className(k)}</h3>`;
    if (!hs.length) { box.innerHTML = html + '<p class="muted">This hand is not in the starting range.</p>'; return; }
    html += `<table><tr><th>Hand</th><th>In range</th>${acting ? '<th>Plays</th>' : ''}<th>Value</th></tr>`;
    for (const h of hs) {
      let mini = '';
      if (acting) { const sig = S.strat[n.di]; mini = '<td><span class="mini">' + n.actions.map((a, i) => `<i style="width:${100 * sig[h * na + i]}%;background:${cols[i]}"></i>`).join('') + '</span></td>'; }
      html += `<tr class="pick" data-h="${h}" title="Put this hand on the table"><td>${handText(h)}</td><td>${pct(r[h], 0)}</td>${mini}<td>${r[h] > 1e-9 ? fmt1(handEV(n, p, h, S.mass[p])) : ''}</td></tr>`;
    }
    html += '</table>';
    if (acting) {
      // per action numbers for the first hand that is still in range
      const h0 = hs.find(h => r[h] > 1e-9);
      if (h0 != null) { const sig = S.strat[n.di];
        html += `<p class="muted" style="margin:8px 0 2px">${handText(h0)} in detail</p><table><tr><th>Action</th><th>How often</th><th>Value</th></tr>` + n.actions.map((a, i) =>
          `<tr><td><span class="mini" style="width:10px"><i style="width:100%;background:${cols[i]}"></i></span> ${actLong(a)}</td><td>${pct(sig[h0 * na + i])}</td><td>${fmt1(handEV(n.children[i], p, h0, S.mass[p]))}</td></tr>`).join('') + '</table>'; }
    }
    html += '<p class="muted" style="margin:8px 0 0">Click a row to put that hand on the table.</p>';
    box.innerHTML = html;
  }
  function renderEditBar() {
    $('editbar').hidden = !S.edit; $('btnEdit').setAttribute('aria-pressed', S.edit);
    if (!S.edit) return;
    $('brushes').innerHTML = [0, 0.25, 0.5, 0.75, 1].map(b => `<button class="btn small" type="button" data-b="${b}" aria-pressed="${S.brush === b}">${b * 100}%</button>`).join(' ');
    if (document.activeElement !== $('rangeText')) $('rangeText').value = P.rangeToString(S.cfg.weights[S.tab]);
    $('rangeCount').textContent = `${S.g.nLive[S.tab]} hands possible on this board`;
  }

  // ---------- game tree ----------
  function renderTree() {
    const g = S.g, box = $('treebox'), onPath = new Set(), inSub = new Set();
    for (let n = S.node; n; n = n.parent) onPath.add(n.id);
    (function mark(n) { inSub.add(n.id); if (n.children) n.children.forEach(mark); })(S.node);
    const all = S.treeMode === 'all';
    const expanded = n => n.type === 'd' && (all || inSub.has(n.id) || (onPath.has(n.id) && n !== S.node) || n === S.node);
    let row = 0, maxD = 0; const items = [];
    (function lay(n, d) {
      const it = { n, d, kids: [] }; items.push(it); maxD = Math.max(maxD, d);
      if (expanded(n)) it.kids = n.children.map(c => lay(c, d + 1));
      it.y = it.kids.length ? (it.kids[0].y + it.kids[it.kids.length - 1].y) / 2 : row++;
      return it;
    })(g.root, 0);
    const RH = 25, L = 18, Rm = 150, cw = Math.max(104, Math.min(190, ((box.clientWidth || 640) - L - Rm) / Math.max(1, maxD)));
    const W = L + Rm + cw * maxD, H = row * RH + 14, X = it => L + it.d * cw, Y = it => 16 + it.y * RH;
    let edges = '', nodes = '';
    for (const it of items) {
      const n = it.n, x = X(it), y = Y(it), on = onPath.has(n.id);
      it.kids.forEach((k, a) => {
        const x2 = X(k), y2 = Y(k), eo = onPath.has(k.n.id), pr = S.prob[k.n.id], mx = x + (x2 - x) * 0.45;
        edges += `<path class="edge${eo ? ' on' : ''}" d="M${x},${y} C${mx},${y} ${mx},${y2} ${x2 - 10},${y2}" stroke-width="${(1 + 5 * Math.sqrt(Math.max(pr, 0))).toFixed(2)}"/>`;
        edges += `<text class="elab${eo ? ' on' : ''}" x="${x2 - 13}" y="${y2 - 5}" text-anchor="end">${esc(actShort(n.actions[a]))} · ${pct(actFreq(n, a), 0)}</text>`;
      });
      const cur = n === S.node ? ' cur' : '', off = S.prob[n.id] < 1e-4 ? ' off' : '';
      if (n.type === 'd') {
        const stub = !it.kids.length;
        nodes += `<g class="nd${cur}${off}" data-id="${n.id}" tabindex="0" role="button" aria-label="${esc(nm(n.player))} to act"><circle cx="${x}" cy="${y}" r="8" fill="var(--p${n.player})"/>${stub ? `<text x="${x}" y="${y + 3.5}" text-anchor="middle">+</text>` : ''}${cur ? `<circle class="ring" cx="${x}" cy="${y}" r="11.5"/>` : ''}</g>`;
      } else {
        const lab = n.type === 'fold' ? `${nm(1 - n.folder).slice(0, 14)} wins ${fmt(potNow(n))}` : `showdown for ${fmt(potNow(n))}`;
        nodes += `<g class="nd leaf${cur}${off}" data-id="${n.id}" tabindex="0" role="button"><rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2"/>${cur ? `<circle class="ring" cx="${x}" cy="${y}" r="11.5"/>` : ''}<text x="${x + 12}" y="${y + 3.5}" style="font-size:10.5px;font-weight:${on ? 600 : 400}">${esc(lab)}</text></g>`;
      }
    }
    box.innerHTML = `<svg class="tree" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Game tree of the river">${edges}${nodes}</svg>`;
    $('btnTreeAll').setAttribute('aria-pressed', all); $('btnTreeLine').setAttribute('aria-pressed', !all);
    const nl = g.nodes.length - g.decisions.length;
    $('treehint').innerHTML = `<span style="color:var(--p0)">●</span> ${esc(nm(0))} decides &nbsp; <span style="color:var(--p1)">●</span> ${esc(nm(1))} decides &nbsp; ▫ the hand ends. The whole river has ${g.decisions.length} decision points and ${nl} endings. Thicker branches are played more often, and the ring marks where the table is now. Click any point to jump there.`;
  }

  // ---------- convergence chart ----------
  let chartGeom = null;
  function renderChart() {
    const box = $('chartbox'), W = Math.max(300, box.clientWidth || 600), H = 250, m = { l: 50, r: 62, t: 12, b: 34 };
    const series = ALGO_KEYS.map(a => ({ a, s: S.solvers[a] })).filter(o => o.s.hist.length);
    const potp = e => Math.max(1e-9, 100 * e / S.g.pot);
    if (!series.length) { box.innerHTML = '<p class="muted" style="margin:0">Press Solve to run one algorithm, or Race all four to compare them on this spot.</p>'; $('racetab').innerHTML = ''; renderStatus(); chartGeom = null; return; }
    let tmax = 10, lo = Infinity, hi = -Infinity;
    for (const o of series) for (const [t, e] of o.s.hist) { tmax = Math.max(tmax, t); lo = Math.min(lo, potp(e)); hi = Math.max(hi, potp(e)); }
    const x1 = Math.log10(tmax), y0 = Math.floor(Math.log10(lo) + 1e-9), y1 = Math.max(y0 + 1, Math.ceil(Math.log10(hi) - 1e-9));
    const X = t => m.l + (W - m.l - m.r) * Math.log10(t) / x1, Y = v => m.t + (H - m.t - m.b) * (y1 - Math.log10(v)) / (y1 - y0);
    let s = '';
    const step = Math.max(1, Math.ceil((y1 - y0) / 6));
    for (let d = y0; d <= y1; d += step) { const y = Y(Math.pow(10, d)); s += `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${d >= 0 ? Math.pow(10, d) : Math.pow(10, d).toFixed(-d)}%</text>`; }
    for (let d = 0; d <= x1 + 1e-9; d++) { const x = X(Math.pow(10, d)); s += `<line class="gl" x1="${x}" x2="${x}" y1="${m.t}" y2="${H - m.b}"/><text x="${x}" y="${H - m.b + 15}" text-anchor="middle">${Math.pow(10, d).toLocaleString('en-US')}</text>`; }
    s += `<line class="ax" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/><text x="${(m.l + W - m.r) / 2}" y="${H - 3}" text-anchor="middle">iterations</text>`;
    const ends = [];
    for (const o of series) {
      s += `<path class="ser" stroke="${ALGO_VAR[o.a]}" d="${o.s.hist.map(([t, e], i) => (i ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(potp(e)).toFixed(1)).join('')}"/>`;
      const last = o.s.hist[o.s.hist.length - 1]; ends.push({ a: o.a, x: X(last[0]), y: Y(potp(last[1])) });
    }
    ends.sort((p, q) => p.y - q.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].ly = (ends[i - 1].ly || ends[i - 1].y) + 13;
    for (const e of ends) s += `<circle cx="${e.x}" cy="${e.y}" r="3.5" fill="${ALGO_VAR[e.a]}" stroke="var(--panel)" stroke-width="1.5"/><text class="endlab" x="${e.x + 8}" y="${(e.ly || e.y) + 4}">${P.ALGOS[e.a]}</text>`;
    s += `<line id="xh" class="ax" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>`;
    box.innerHTML = `<div class="muted" style="font-size:12.5px;margin-bottom:2px">How far the average strategy is from equilibrium, as a percentage of the pot. Both axes are logarithmic.</div><svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Exploitability against iterations for each algorithm">${s}</svg><div class="tip" id="tip" hidden></div>`;
    chartGeom = { W, m, x1, series };
    $('racetab').innerHTML = '<tr><th>Algorithm</th><th>Iterations</th><th>Exploitability, chips</th><th>Percent of pot</th><th>Seconds</th></tr>' + series.map(o => {
      const [t, e] = o.s.hist[o.s.hist.length - 1];
      return `<tr><td><i style="background:${ALGO_VAR[o.a]}"></i>${P.ALGOS[o.a]}</td><td>${t.toLocaleString('en-US')}</td><td>${sci(e)}</td><td>${sci(100 * e / S.g.pot)}%</td><td>${(o.s.time / 1000).toFixed(1)}</td></tr>`;
    }).join('');
    renderStatus();
  }
  function chartHover(ev) {
    const tip = $('tip'), xh = document.getElementById('xh'); if (!chartGeom || !tip) return;
    const svg = $('chartbox').querySelector('svg'), rect = svg.getBoundingClientRect(), { W, m, x1, series } = chartGeom;
    const px = ev.clientX - rect.left;
    if (ev.type === 'pointerleave' || px < m.l || px > W - m.r + 4) { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); return; }
    const t = Math.pow(10, x1 * (px - m.l) / (W - m.l - m.r));
    let rows = '', tt = 0;
    for (const o of series) { let best = o.s.hist[0]; for (const pnt of o.s.hist) if (Math.abs(Math.log(pnt[0] / t)) < Math.abs(Math.log(best[0] / t))) best = pnt;
      tt = Math.max(tt, best[0]); rows += `<div><i style="background:${ALGO_VAR[o.a]}"></i>${P.ALGOS[o.a]} at ${best[0]}: <b>${sci(100 * best[1] / S.g.pot)}%</b></div>`; }
    tip.innerHTML = rows; tip.hidden = false;
    xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('visibility', 'visible');
    const boxR = $('chartbox').getBoundingClientRect(); let left = px + 14; if (left + tip.offsetWidth > boxR.width) left = px - tip.offsetWidth - 10;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = (rect.top - boxR.top + 14) + 'px';
  }
  function renderStatus() {
    const sol = S.solvers[S.algo], el = $('status');
    $('btnStop').disabled = !job;
    if (S.error) { el.textContent = S.error; return; }
    if (job) { el.innerHTML = `Running ${job.algos.map(a => P.ALGOS[a]).join(', ')}: <b>${Math.min(...job.algos.map(a => S.solvers[a].t))}</b> of ${job.target} iterations.`; return; }
    if (!sol.t) { el.textContent = `${P.ALGOS[S.algo]} has not run on this spot yet.`; return; }
    const e = sol.hist.length ? sol.hist[sol.hist.length - 1][1] : NaN, v = S.view.value0 + S.g.pot / 2;
    el.innerHTML = `<b>${P.ALGOS[S.algo]}</b> after ${sol.t.toLocaleString('en-US')} iterations is within <b>${sci(100 * e / S.g.pot)}%</b> of the pot of an equilibrium. ${esc(nm(0))} expects ${fmt1(v)} chips of the ${fmt(S.g.pot)} in the pot and ${esc(nm(1))} expects ${fmt1(S.g.pot - v)}.`;
  }

  function renderAll() { renderTable(); renderCrumbs(); renderActions(); renderTabs(); renderEditBar(); renderGrid(); renderDetail(); renderTree(); renderStatus(); }

  // ---------- card picker ----------
  let pick = null;
  function openPicker(kind, idx) {
    const g = S.g, taken = new Set();
    if (kind === 'board') S.cfg.board.forEach((c, i) => { if (i !== idx) taken.add(c); });
    else { S.cfg.board.forEach(c => taken.add(c)); const o = S.hole[1 - idx]; if (o >= 0) { taken.add(g.ca[o]); taken.add(g.cb[o]); } }
    pick = { kind, idx, taken, chosen: [] };
    $('popTitle').textContent = kind === 'board' ? 'Choose the new board card' : `Choose two cards for ${nm(idx)}`;
    $('popRandom').hidden = kind === 'board';
    drawPicker(); $('pop').hidden = false;
  }
  function drawPicker() {
    let html = '';
    for (const s of [3, 2, 1, 0]) for (let r = 12; r >= 0; r--) { const c = r * 4 + s; html += cardHtml(c, 'button', pick.chosen.indexOf(c) >= 0 ? 'chosen' : '').replace('data-c=', (pick.taken.has(c) ? 'disabled ' : '') + 'data-c='); }
    $('pick').innerHTML = html;
  }
  function pickCard(c) {
    if (pick.kind === 'board') { S.cfg.board[pick.idx] = c; closePicker(); buildGame(true); return; }
    if (pick.chosen.indexOf(c) >= 0) pick.chosen = pick.chosen.filter(x => x !== c); else pick.chosen.push(c);
    if (pick.chosen.length === 2) { const [a, b] = pick.chosen.sort((x, y) => x - y), g = S.g; let h = -1; for (let i = 0; i < g.N; i++) if (g.ca[i] === a && g.cb[i] === b) { h = i; break; }
      S.hole[pick.idx] = h; S.tab = pick.idx; closePicker(); renderAll(); } else drawPicker();
  }
  function closePicker() { $('pop').hidden = true; pick = null; }
  function sample(w) { let tot = 0; for (let i = 0; i < w.length; i++) tot += w[i]; let u = Math.random() * tot; for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0 && w[i] > 0) return i; } return -1; }
  const shares = (a, b) => { const g = S.g; return g.ca[a] === g.ca[b] || g.ca[a] === g.cb[b] || g.cb[a] === g.ca[b] || g.cb[a] === g.cb[b]; };
  function dealRandom() {
    const g = S.g; if (!(g.Z > 0)) return;
    for (let k = 0; k < 500; k++) { const a = sample(g.w[0]), b = sample(g.w[1]); if (a >= 0 && b >= 0 && !shares(a, b)) { S.hole = [a, b]; break; } }
    goNode(g.root);
  }
  function solverActs() {
    const n = S.node; if (n.type !== 'd') return;
    const p = n.player, h = S.hole[p], w = new Float64Array(n.na);
    const own = h >= 0 && S.view[n.id].reach[p][h] > 1e-9;
    for (let a = 0; a < n.na; a++) w[a] = own ? S.strat[n.di][h * n.na + a] : Math.max(0, actFreq(n, a) || 0);
    const a = sample(w); act(a >= 0 ? a : 0);
  }
  function setHand(p, str) { const a = P.cardOf(str.slice(0, 2)), b = P.cardOf(str.slice(2, 4)), lo = Math.min(a, b), hi = Math.max(a, b), g = S.g;
    for (let i = 0; i < g.N; i++) if (g.ca[i] === lo && g.cb[i] === hi) { S.hole[p] = i; return; } }
  function goLine(labels) { let n = S.g.root; for (const l of labels) { const i = n.actions.findIndex(a => actShort(a) === l || a.kind === l); if (i < 0) break; n = n.children[i]; } goNode(n); }

  // ---------- setup form ----------
  function fillSetup() {
    const c = S.cfg;
    $('name0').value = c.names[0]; $('name1').value = c.names[1]; $('pot').value = c.pot; $('stack').value = c.stack;
    $('bets0').value = c.bets[0].join(', '); $('bets1').value = c.bets[1].join(', '); $('raises').value = c.raises.join(', '); $('maxRaises').value = c.maxRaises;
    $('target').value = S.target; $('algo').value = S.algo;
  }
  const nums = s => s.split(/[\s,;]+/).map(parseFloat).filter(x => x > 0 && isFinite(x)).slice(0, 4);
  function readSetup() {
    const c = S.cfg;
    c.pot = Math.max(1, parseFloat($('pot').value) || 100); c.stack = Math.max(1, parseFloat($('stack').value) || 100);
    c.bets = [nums($('bets0').value), nums($('bets1').value)]; c.raises = nums($('raises').value); c.maxRaises = parseInt($('maxRaises').value, 10) || 2;
    buildGame(true);
  }

  // ---------- demo guide ----------
  const GUIDE = [
    ['The spot from the slides', 'Load the river spot used in the talk. The board, the pot and both ranges are the ones on the slides, and the table is the picture from the hold’em slide.',
      () => { S.cfg = talkCfg(); S.tab = 0; fillSetup(); buildGame(true); }],
    ['Race the four algorithms', 'Run CFR, CFR+, DCFR and PCFR+ side by side on this spot and watch the exploitability curves separate.',
      () => { for (const a of ALGO_KEYS) S.solvers[a] = new P.Solver(S.g, a); startJob(ALGO_KEYS.slice(), S.target); }],
    ['The big blind’s opening strategy', 'Go back to the first decision and read the grid: which hands check, which bet small, and which bet big.',
      () => { S.tab = 0; S.sel = -1; goNode(S.g.root); }],
    ['One hand at a time', 'Put a set of sevens in the big blind’s hand and king-queen in the button’s hand, then look at how often each action is taken with exactly those cards.',
      () => { setHand(0, '7h7s'); setHand(1, 'KhQh'); S.tab = 0; S.sel = P.classOf(P.cardOf('7h'), P.cardOf('7s')); goNode(S.g.root); }],
    ['Follow a line through the tree', 'The big blind checks and the button bets three quarters of the pot. The tree follows along and the grid now shows the big blind facing a bet.',
      () => { S.tab = 0; S.sel = -1; goLine(['check', 'bet 75']); }],
    ['A hand that is indifferent', 'Select a hand that mixes between calling and folding. Its value is the same for both actions, which is exactly the equilibrium condition.',
      () => { S.tab = 0; goLine(['check', 'bet 75']); S.sel = mixedClass(); renderAll(); }],
    ['The button’s side', 'Switch to the button’s tab after the check to see which hands bet for value, which bluff, and which give up.',
      () => { S.sel = -1; goLine(['check']); S.tab = 1; renderAll(); }],
    ['Change the river card', 'Replace the last board card with the nine of hearts and solve again. Straights are now possible, and both strategies change.',
      () => { S.cfg.board[4] = P.cardOf('9h'); S.tab = 0; buildGame(true); }],
    ['Change a range', 'Open the range editor for the tab that is showing. Paint hands in or out and the spot is solved again.',
      () => { S.edit = true; goNode(S.g.root); }],
    ['Change the bet sizes', 'Open the setup panel and give the players different bet sizes. A bigger tree takes longer for each iteration.',
      () => { $('setup').open = true; $('bets0').focus(); }]];
  function mixedClass() {
    const n = S.node; if (n.type !== 'd') return -1; const p = n.player, r = S.view[n.id].reach[p], sig = S.strat[n.di]; let best = -1, bs = 0;
    for (let k = 0; k < 169; k++) for (const h of S.classHands[k]) { if (r[h] < 0.5) continue; const f = sig[h * n.na], c = sig[h * n.na + 1], sc = Math.min(f, c); if (sc > bs) { bs = sc; best = k; } }
    return best;
  }
  function initGuide() {
    $('guideList').innerHTML = GUIDE.map((s, i) => `<li><h3><span class="n">${i + 1}</span>${esc(s[0])}</h3><p>${esc(s[1])}</p><button class="btn small" type="button" data-s="${i}">Show me</button></li>`).join('');
  }

  // ---------- events ----------
  function init() {
    $('algo').innerHTML = ALGO_KEYS.map(a => `<option value="${a}">${P.ALGOS[a]}</option>`).join('');
    $('preset').innerHTML = '<option value="">Load a range…</option>' + PRESETS.map((p, i) => `<option value="${i}">${esc(p[0])}</option>`).join('');
    initGrid(); initGuide(); fillSetup();
    $('board').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) openPicker('board', +b.dataset.i); });
    for (const p of [0, 1]) $('seat' + p).addEventListener('click', e => { if (e.target.closest('.hole')) openPicker('hole', p); });
    $('pick').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) pickCard(+b.dataset.c); });
    $('popCancel').onclick = closePicker;
    $('pop').addEventListener('click', e => { if (e.target === $('pop')) closePicker(); });
    $('popRandom').onclick = () => { const g = S.g, p = pick.idx, o = S.hole[1 - p]; for (let k = 0; k < 200; k++) { const h = sample(g.w[p]); if (h >= 0 && (o < 0 || !shares(h, o))) { S.hole[p] = h; break; } } S.tab = p; closePicker(); renderAll(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('pop').hidden) closePicker(); else if (!$('guide').hidden) $('guide').hidden = true; } });
    $('actions').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) act(+b.dataset.a); });
    $('crumbs').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; let n = S.g.root; S.path.slice(0, +b.dataset.d).forEach(a => { n = n.children[a]; }); goNode(n); });
    $('btnBack').onclick = () => { if (S.node.parent) goNode(S.node.parent); };
    $('btnRestart').onclick = () => goNode(S.g.root);
    $('btnSample').onclick = solverActs;
    $('btnDeal').onclick = dealRandom;
    $('btnHide').onclick = () => { S.hole = [-1, -1]; renderAll(); };
    $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { S.tab = +b.dataset.p; S.sel = -1; S.hover = -1; renderAll(); } });
    // grid: hover, select, paint
    const grid = $('grid'); let painting = false, dirty = false;
    const cellAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest ? el.closest('.cell') : null; return c && grid.contains(c) ? +c.dataset.k : -1; };
    const paint = k => { if (k < 0 || S.cfg.weights[S.tab][k] === S.brush) return; S.cfg.weights[S.tab][k] = S.brush; dirty = true;
      const g = S.g; for (const h of S.classHands[k]) g.w[S.tab][h] = S.brush; renderGrid(); };
    grid.addEventListener('pointerdown', e => { const k = cellAt(e); if (k < 0) return;
      if (S.edit) { painting = true; stopJob(); paint(k); e.preventDefault(); } else { S.sel = S.sel === k ? -1 : k; S.hover = -1; renderGrid(); renderDetail(); } });
    grid.addEventListener('pointermove', e => { const k = cellAt(e); if (S.edit) { if (painting) paint(k); } else if (e.pointerType === 'mouse' && k !== S.hover) { S.hover = k; renderDetail(); } });
    grid.addEventListener('pointerleave', () => { if (S.hover >= 0) { S.hover = -1; renderDetail(); } });
    window.addEventListener('pointerup', () => { if (painting) { painting = false; if (dirty) { dirty = false; $('rangeText').value = P.rangeToString(S.cfg.weights[S.tab]); scheduleRebuild(); } } });
    $('detail').addEventListener('click', e => { const r = e.target.closest('[data-h]'); if (!r) return; const h = +r.dataset.h, o = S.hole[1 - S.tab]; if (o >= 0 && shares(h, o)) S.hole[1 - S.tab] = -1; S.hole[S.tab] = h; renderAll(); });
    $('btnEdit').onclick = () => { S.edit = !S.edit; S.sel = -1; renderAll(); };
    $('brushes').addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (b) { S.brush = +b.dataset.b; renderEditBar(); } });
    $('preset').onchange = e => { if (e.target.value === '') return; S.cfg.weights[S.tab] = P.parseRange(PRESETS[+e.target.value][1]); e.target.value = ''; const t = S.tab; buildGame(true); S.tab = t; S.edit = true; renderAll(); };
    $('btnClear').onclick = () => { S.cfg.weights[S.tab] = new Float64Array(169); const t = S.tab; buildGame(false); S.tab = t; S.edit = true; renderAll(); };
    $('btnApplyText').onclick = () => { S.cfg.weights[S.tab] = P.parseRange($('rangeText').value); const t = S.tab; buildGame(true); S.tab = t; S.edit = true; renderAll(); };
    // tree
    const treeGo = e => { const n = e.target.closest('[data-id]'); if (n) { const node = S.g.nodes[+n.dataset.id]; if (node.type === 'd') S.tab = node.player; goNode(node); } };
    $('treebox').addEventListener('click', treeGo);
    $('treebox').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); treeGo(e); } });
    $('btnTreeAll').onclick = () => { S.treeMode = 'all'; renderTree(); };
    $('btnTreeLine').onclick = () => { S.treeMode = 'line'; renderTree(); };
    // solver
    $('algo').onchange = e => { S.algo = e.target.value; refreshView(); renderAll(); renderStatus(); };
    $('target').onchange = e => { S.target = Math.max(10, Math.min(20000, parseInt(e.target.value, 10) || 1000)); e.target.value = S.target; };
    $('btnSolve').onclick = () => { const s = S.solvers[S.algo]; startJob([S.algo], s.t >= S.target ? s.t + S.target : S.target); };
    $('btnRace').onclick = () => { const tm = Math.max(S.target, ...ALGO_KEYS.map(a => S.solvers[a].t)); startJob(ALGO_KEYS.slice(), tm); };
    $('btnStop').onclick = () => { stopJob(); refreshView(); renderAll(); renderChart(); };
    $('btnReset').onclick = () => { stopJob(); for (const a of ALGO_KEYS) S.solvers[a] = new P.Solver(S.g, a); refreshView(); renderAll(); renderChart(); };
    $('chartbox').addEventListener('pointermove', chartHover); $('chartbox').addEventListener('pointerleave', chartHover);
    // setup
    for (const id of ['pot', 'stack', 'bets0', 'bets1', 'raises', 'maxRaises']) $(id).addEventListener('change', readSetup);
    for (const p of [0, 1]) $('name' + p).addEventListener('input', e => { S.cfg.names[p] = e.target.value.slice(0, 24); renderAll(); });
    $('btnTalk').onclick = () => { S.cfg = talkCfg(); fillSetup(); buildGame(true); };
    $('btnRandomBoard').onclick = () => { const d = Array.from({ length: 52 }, (_, i) => i); for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } S.cfg.board = d.slice(0, 5); buildGame(true); };
    $('btnSwap').onclick = () => { const c = S.cfg; c.names.reverse(); c.weights.reverse(); c.bets.reverse(); fillSetup(); buildGame(true); };
    // guide
    $('btnGuide').onclick = () => { $('guide').hidden = !$('guide').hidden; };
    $('btnGuideClose').onclick = () => { $('guide').hidden = true; };
    $('guideList').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; S.edit = false; GUIDE[+b.dataset.s][2](); b.closest('li').classList.add('done'); if (window.innerWidth < 900) $('guide').hidden = true; });
    let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderTree(); renderChart(); }, 150); });
    buildGame(true);
  }
  window.RiverTable = { S, goLine, setHand, startJob };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
