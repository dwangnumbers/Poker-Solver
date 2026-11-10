/* River solver core: range-vectorised CFR, CFR+, DCFR and PCFR+ on the public betting tree.
   Terminal values use the sorted prefix-sum evaluation with card-removal correction, O(n) per leaf.
   Pure functions, no DOM. Works in the browser and in node (for tests). */
(function (root) {
  'use strict';
  const RANKS = '23456789TJQKA', SUITS = 'cdhs';
  const cardOf = s => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]);
  const cardStr = c => RANKS[c >> 2] + SUITS[c & 3];

  // ---- seven-card evaluator: larger value = stronger hand ----
  function eval7(cards) {
    const rc = new Int8Array(13), sc = new Int8Array(4);
    for (const c of cards) { rc[c >> 2]++; sc[c & 3]++; }
    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
    const straightHigh = mask => {
      for (let hi = 12; hi >= 4; hi--) if (((mask >> (hi - 4)) & 31) === 31) return hi;
      return (mask & 0x100F) === 0x100F ? 3 : -1;           // wheel A-2-3-4-5
    };
    const pack = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 13 + (ks[i] || 0); return v; };
    let rmask = 0; for (let r = 0; r < 13; r++) if (rc[r]) rmask |= 1 << r;
    if (flushSuit >= 0) {
      let fm = 0; for (const c of cards) if ((c & 3) === flushSuit) fm |= 1 << (c >> 2);
      const sh = straightHigh(fm);
      if (sh >= 0) return pack(8, [sh]);
      const ks = []; for (let r = 12; r >= 0 && ks.length < 5; r--) if (fm >> r & 1) ks.push(r);
      var flushVal = pack(5, ks);
    }
    const quads = [], trips = [], pairs = [], singles = [];
    for (let r = 12; r >= 0; r--) {
      if (rc[r] === 4) quads.push(r); else if (rc[r] === 3) trips.push(r);
      else if (rc[r] === 2) pairs.push(r); else if (rc[r] === 1) singles.push(r);
    }
    if (quads.length) {
      let k = -1; for (let r = 12; r >= 0; r--) if (rc[r] && r !== quads[0]) { k = r; break; }
      return pack(7, [quads[0], k]);
    }
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const p = trips.length > 1 ? Math.max(trips[1], pairs.length ? pairs[0] : -1) : pairs[0];
      return pack(6, [trips[0], p]);
    }
    if (flushSuit >= 0) return flushVal;
    const sh = straightHigh(rmask);
    if (sh >= 0) return pack(4, [sh]);
    if (trips.length) return pack(3, [trips[0], singles[0], singles[1]]);
    if (pairs.length >= 2) {
      let k = -1; for (let r = 12; r >= 0; r--) if (rc[r] && r !== pairs[0] && r !== pairs[1]) { k = r; break; }
      return pack(2, [pairs[0], pairs[1], k]);
    }
    if (pairs.length) return pack(1, [pairs[0], singles[0], singles[1], singles[2]]);
    return pack(0, singles.slice(0, 5));
  }
  const CATEGORY = ['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'flush', 'full house', 'four of a kind', 'straight flush'];
  const categoryOf = v => CATEGORY[Math.floor(v / 371293)];

  // ---- hand classes (the 13 x 13 grid): row i, column j, ranks descending from A ----
  function classOf(a, b) {            // cards a, b
    let r1 = a >> 2, r2 = b >> 2;
    if (r1 < r2) { const t = r1; r1 = r2; r2 = t; }
    const i = 12 - r1, j = 12 - r2;   // i <= j
    if (r1 === r2) return i * 13 + i;
    return (a & 3) === (b & 3) ? i * 13 + j : j * 13 + i;
  }
  function className(k) {
    const i = Math.floor(k / 13), j = k % 13, R = i => RANKS[12 - i];
    if (i === j) return R(i) + R(i);
    return i < j ? R(i) + R(j) + 's' : R(j) + R(i) + 'o';
  }
  /* Range notation: "22+, A2s+, KTo+, 98s, -QQ+"; optional weight "AKs:0.5". Returns Float64Array(169). */
  function parseRange(spec) {
    const w = new Float64Array(169);
    const idx = (hi, lo, kind) => kind === 'p' ? (12 - hi) * 13 + (12 - hi) : kind === 's' ? (12 - hi) * 13 + (12 - lo) : (12 - lo) * 13 + (12 - hi);
    for (let tok of spec.split(',')) {
      tok = tok.trim(); if (!tok) continue;
      let val = 1;
      const neg = tok[0] === '-'; if (neg) tok = tok.slice(1);
      const colon = tok.indexOf(':'); if (colon >= 0) { val = Math.max(0, Math.min(1, parseFloat(tok.slice(colon + 1)) || 0)); tok = tok.slice(0, colon); }
      const plus = tok.endsWith('+'); if (plus) tok = tok.slice(0, -1);
      tok = tok[0].toUpperCase() + (tok[1] || '').toUpperCase() + (tok[2] || '').toLowerCase();
      const hi = RANKS.indexOf(tok[0]), lo = RANKS.indexOf(tok[1]);
      if (hi < 0 || lo < 0) continue;
      const set = k => { w[k] = neg ? 0 : val; };
      if (tok.length === 2 && hi === lo) { for (let r = hi; r <= (plus ? 12 : hi); r++) set(idx(r, r, 'p')); }
      else {
        const H = Math.max(hi, lo), L = Math.min(hi, lo); if (H === L) continue;
        const kinds = tok[2] === 's' ? ['s'] : tok[2] === 'o' ? ['o'] : ['s', 'o'];
        for (const kind of kinds) for (let r = L; r <= (plus ? H - 1 : L); r++) set(idx(H, r, kind));
      }
    }
    return w;
  }
  function rangeToString(w) {
    const out = [];
    for (let k = 0; k < 169; k++) if (w[k] > 0) out.push(className(k) + (w[k] < 0.999 ? ':' + (+w[k].toFixed(2)) : ''));
    return out.join(',');
  }

  // ---- game construction ----
  /* cfg: { board:[5 cards], pot, stack, bets:[[fractions of pot] for OOP, [..] for IP], raises:[fractions], maxRaises,
            weights:[Float64Array(169), Float64Array(169)] } */
  function createGame(cfg) {
    const board = cfg.board.slice(), used = new Set(board);
    const ca = [], cb = [];
    for (let a = 0; a < 52; a++) if (!used.has(a)) for (let b = a + 1; b < 52; b++) if (!used.has(b)) { ca.push(a); cb.push(b); }
    const N = ca.length;
    const key = new Float64Array(N), cls = new Int16Array(N);
    for (let i = 0; i < N; i++) { key[i] = eval7([ca[i], cb[i], ...board]); cls[i] = classOf(ca[i], cb[i]); }
    const order = Array.from({ length: N }, (_, i) => i).sort((x, y) => key[x] - key[y]);
    const groupEnd = new Int32Array(N);            // for position k in order: end (exclusive) of its equal-strength group
    for (let k = 0; k < N;) { let e = k; while (e < N && key[order[e]] === key[order[k]]) e++; for (let q = k; q < e; q++) groupEnd[q] = e; k = e; }
    const w = [new Float64Array(N), new Float64Array(N)];
    for (let p = 0; p < 2; p++) for (let i = 0; i < N; i++) w[p][i] = cfg.weights[p][cls[i]];
    const g = { cfg, board, N, ca: Int8Array.from(ca), cb: Int8Array.from(cb), key, cls, order: Int32Array.from(order), groupEnd, w,
                pot: cfg.pot, stack: cfg.stack, nodes: [], decisions: [] };
    // betting tree
    const pot = cfg.pot, stack = cfg.stack;
    const mk = o => { o.id = g.nodes.length; o.val = new Float64Array(N); o.rbuf = new Float64Array(N); g.nodes.push(o); return o; };
    function build(player, contrib, nRaises, facing, parent, depth) {
      const other = 1 - player;
      const node = mk({ type: 'd', player, contrib: contrib.slice(), actions: [], children: [], parent, depth, facing });
      const add = (label, kind, amount, child) => { child.parent = node; child.pa = node.actions.length; child.depth = depth + 1; node.actions.push({ label, kind, amount }); node.children.push(child); };
      if (facing) {
        const gain0 = player === 1 ? (pot / 2 + contrib[1]) : -(pot / 2 + contrib[0]);
        add('fold', 'fold', 0, mk({ type: 'fold', amount: gain0, folder: player, contrib: contrib.slice() }));
        const c = Math.max(contrib[0], contrib[1]);
        add('call', 'call', c - contrib[player], mk({ type: 'sd', amount: pot / 2 + c, contrib: [c, c] }));
        if (nRaises < cfg.maxRaises && contrib[other] < stack) {
          const cur = pot + 2 * contrib[other];
          const sizes = [...new Set(cfg.raises.map(f => Math.min(contrib[other] + f * cur, stack)).concat([stack]))].sort((x, y) => x - y);
          for (const s of sizes) {
            if (s <= contrib[other] + 1e-9) continue;
            const nc = contrib.slice(); nc[player] = s;
            add(s >= stack ? 'allin' : 'raise', s >= stack ? 'allin' : 'raise', s, build(other, nc, nRaises + 1, true, node, depth + 1));
            node.actions[node.actions.length - 1].frac = (s - contrib[other]) / cur;
          }
        }
      } else {
        if (player === 0) add('check', 'check', 0, build(other, contrib, nRaises, false, node, depth + 1));
        else add('check', 'check', 0, mk({ type: 'sd', amount: pot / 2, contrib: contrib.slice() }));
        const sizes = [...new Set(cfg.bets[player].map(f => Math.min(f * pot, stack)).concat([stack]))].sort((x, y) => x - y);
        for (const s of sizes) {
          if (s <= 1e-9) continue;
          const nc = contrib.slice(); nc[player] = s;
          add(s >= stack ? 'allin' : 'bet', s >= stack ? 'allin' : 'bet', s, build(other, nc, nRaises + 1, true, node, depth + 1));
          node.actions[node.actions.length - 1].frac = s / pot;
        }
      }
      return node;
    }
    g.root = build(0, [0, 0], 0, false, null, 0);
    g.decisions = g.nodes.filter(n => n.type === 'd');
    g.decisions.forEach((n, k) => { n.di = k; n.na = n.actions.length; });
    // deal weight Z = sum_ij w0_i w1_j [no shared card]
    const t = new Float64Array(N); foldEval(g, w[1], t);
    let Z = 0; for (let i = 0; i < N; i++) Z += w[0][i] * t[i];
    g.Z = Z;
    g.nLive = [0, 1].map(p => w[p].reduce((s, x) => s + (x > 0 ? 1 : 0), 0));
    return g;
  }

  // out[i] = sum_j w[j] [hands i, j share no card]
  const cardSum = new Float64Array(52);
  function foldEval(g, w, out) {
    const N = g.N, ca = g.ca, cb = g.cb; let tot = 0; cardSum.fill(0);
    for (let j = 0; j < N; j++) { const x = w[j]; if (x !== 0) { tot += x; cardSum[ca[j]] += x; cardSum[cb[j]] += x; } }
    for (let i = 0; i < N; i++) out[i] = tot - cardSum[ca[i]] - cardSum[cb[i]] + w[i];
  }
  // out[i] = sum_j w[j] [no shared card] sign(strength_i - strength_j): one ascending and one descending sweep
  function showdownEval(g, w, out) {
    const N = g.N, ca = g.ca, cb = g.cb, ord = g.order, ge = g.groupEnd;
    let cum = 0; cardSum.fill(0);
    for (let k = 0; k < N;) {
      const e = ge[k];
      for (let q = k; q < e; q++) { const i = ord[q]; out[i] = cum - cardSum[ca[i]] - cardSum[cb[i]]; }
      for (let q = k; q < e; q++) { const i = ord[q], x = w[i]; if (x !== 0) { cum += x; cardSum[ca[i]] += x; cardSum[cb[i]] += x; } }
      k = e;
    }
    cum = 0; cardSum.fill(0);
    for (let k = N; k > 0;) {
      let s = k - 1; while (s > 0 && ge[s - 1] === ge[k - 1]) s--;
      for (let q = s; q < k; q++) { const i = ord[q]; out[i] -= cum - cardSum[ca[i]] - cardSum[cb[i]]; }
      for (let q = s; q < k; q++) { const i = ord[q], x = w[i]; if (x !== 0) { cum += x; cardSum[ca[i]] += x; cardSum[cb[i]] += x; } }
      k = s;
    }
  }
  // value vector of a leaf for player p, given the opponent's reach
  function leafValue(g, node, p, rOpp, out) {
    if (node.type === 'fold') { foldEval(g, rOpp, out); const a = p === 0 ? node.amount : -node.amount; for (let i = 0; i < g.N; i++) out[i] *= a; }
    else { showdownEval(g, rOpp, out); const a = node.amount; for (let i = 0; i < g.N; i++) out[i] *= a; }
    return out;
  }

  const ALGOS = { cfr: 'CFR', 'cfr+': 'CFR+', dcfr: 'DCFR', 'pcfr+': 'PCFR+' };

  // ---- the solver ----
  function Solver(game, algo) {
    const g = this.g = game; this.algo = algo; this.t = 0; this.time = 0;
    const N = g.N;
    this.R = g.decisions.map(n => new Float64Array(N * n.na));
    this.S = g.decisions.map(n => new Float64Array(N * n.na));
    this.M = g.decisions.map(n => new Float64Array(N * n.na));
    this.sig = g.decisions.map(n => new Float64Array(N * n.na));
    this.reg = g.decisions.map(n => new Float64Array(N * n.na));
    this.hist = [];                                   // [iteration, exploitability of the average strategy]
  }
  function regretMatch(R, M, na, N, out) {
    for (let h = 0, o = 0; h < N; h++, o += na) {
      let s = 0;
      for (let a = 0; a < na; a++) { const x = R[o + a] + (M ? M[o + a] : 0); if (x > 0) s += x; }
      if (s > 0) for (let a = 0; a < na; a++) { const x = R[o + a] + (M ? M[o + a] : 0); out[o + a] = x > 0 ? x / s : 0; }
      else for (let a = 0; a < na; a++) out[o + a] = 1 / na;
    }
  }
  Solver.prototype.computeSigma = function (out) {
    const g = this.g;
    for (const n of g.decisions) regretMatch(this.R[n.di], this.algo === 'pcfr+' ? this.M[n.di] : null, n.na, g.N, out[n.di]);
    return out;
  };
  Solver.prototype.step = function () {
    const g = this.g, N = g.N, algo = this.algo, t = ++this.t;
    for (let p = 0; p < 2; p++) {
      this.computeSigma(this.sig);
      const wAvg = algo === 'cfr+' ? t : algo === 'pcfr+' ? t * t : 1;
      if (algo === 'dcfr' && t > 1) {
        const d = Math.pow(t / (t + 1), 2);
        for (const n of g.decisions) if (n.player === p) { const S = this.S[n.di]; for (let k = 0; k < S.length; k++) S[k] *= d; }
      }
      this.walk(g.root, p, g.w[p], g.w[1 - p], wAvg);
      const a = Math.pow(t, 1.5) / (Math.pow(t, 1.5) + 1), b = 0.5;
      for (const n of g.decisions) if (n.player === p) {
        const R = this.R[n.di], r = this.reg[n.di], M = this.M[n.di];
        if (algo === 'cfr') for (let k = 0; k < R.length; k++) R[k] += r[k];
        else if (algo === 'cfr+') for (let k = 0; k < R.length; k++) { const x = R[k] + r[k]; R[k] = x > 0 ? x : 0; }
        else if (algo === 'pcfr+') for (let k = 0; k < R.length; k++) { const x = R[k] + r[k]; R[k] = x > 0 ? x : 0; M[k] = r[k]; }
        else for (let k = 0; k < R.length; k++) R[k] = (R[k] > 0 ? R[k] * a : R[k] * b) + r[k];
      }
    }
  };
  // counterfactual values for player p; writes instantaneous regrets and accumulates the average strategy
  Solver.prototype.walk = function (node, p, rOwn, rOpp, wAvg) {
    const g = this.g, N = g.N, out = node.val;
    if (node.type !== 'd') return leafValue(g, node, p, rOpp, out);
    const na = node.na, sig = this.sig[node.di];
    if (node.player === p) {
      const S = this.S[node.di];
      for (let a = 0; a < na; a++) {
        const ch = node.children[a], rb = ch.rbuf;
        for (let h = 0; h < N; h++) { const x = rOwn[h] * sig[h * na + a]; rb[h] = x; S[h * na + a] += wAvg * x; }
        this.walk(ch, p, rb, rOpp, wAvg);
      }
      const reg = this.reg[node.di];
      out.fill(0);
      for (let a = 0; a < na; a++) { const v = node.children[a].val; for (let h = 0; h < N; h++) out[h] += sig[h * na + a] * v[h]; }
      for (let a = 0; a < na; a++) { const v = node.children[a].val; for (let h = 0; h < N; h++) reg[h * na + a] = v[h] - out[h]; }
    } else {
      for (let a = 0; a < na; a++) {
        const ch = node.children[a], rb = ch.rbuf;
        for (let h = 0; h < N; h++) rb[h] = rOpp[h] * sig[h * na + a];
        this.walk(ch, p, rOwn, rb, wAvg);
      }
      out.fill(0);
      for (let a = 0; a < na; a++) { const v = node.children[a].val; for (let h = 0; h < N; h++) out[h] += v[h]; }
    }
    return out;
  };
  Solver.prototype.average = function () {
    const g = this.g, N = g.N;
    return g.decisions.map(n => {
      const S = this.S[n.di], na = n.na, out = new Float64Array(N * na);
      for (let h = 0, o = 0; h < N; h++, o += na) {
        let s = 0; for (let a = 0; a < na; a++) s += S[o + a];
        for (let a = 0; a < na; a++) out[o + a] = s > 0 ? S[o + a] / s : 1 / na;
      }
      return out;
    });
  };
  Solver.prototype.current = function () { return this.computeSigma(this.g.decisions.map(n => new Float64Array(this.g.N * n.na))); };

  // best-response value vector for p against strat
  function bestResponse(g, node, p, rOpp, strat) {
    const N = g.N, out = node.val;
    if (node.type !== 'd') return leafValue(g, node, p, rOpp, out);
    const na = node.na, sig = strat[node.di];
    if (node.player === p) {
      for (let a = 0; a < na; a++) bestResponse(g, node.children[a], p, rOpp, strat);
      out.fill(-Infinity);
      for (let a = 0; a < na; a++) { const v = node.children[a].val; for (let h = 0; h < N; h++) if (v[h] > out[h]) out[h] = v[h]; }
    } else {
      for (let a = 0; a < na; a++) {
        const ch = node.children[a], rb = ch.rbuf;
        for (let h = 0; h < N; h++) rb[h] = rOpp[h] * sig[h * na + a];
        bestResponse(g, ch, p, rb, strat);
      }
      out.fill(0);
      for (let a = 0; a < na; a++) { const v = node.children[a].val; for (let h = 0; h < N; h++) out[h] += v[h]; }
    }
    return out;
  }
  // exploitability in chips per hand: (BR_0 + BR_1) / 2
  function exploitability(g, strat) {
    let tot = 0;
    for (let p = 0; p < 2; p++) {
      const v = bestResponse(g, g.root, p, g.w[1 - p], strat);
      let s = 0; for (let h = 0; h < g.N; h++) s += g.w[p][h] * v[h];
      tot += s / g.Z;
    }
    return tot / 2;
  }
  Solver.prototype.exploitability = function () { return exploitability(this.g, this.average()); };

  /* Everything the interface shows for a strategy profile: at every node, both reach vectors and both players'
     counterfactual value vectors (each player's own strategy below the node). */
  function analyse(g, strat) {
    const N = g.N;
    const view = g.nodes.map(() => ({ reach: [null, null], ev: [null, null] }));
    (function down(node, r0, r1) {
      view[node.id].reach = [r0, r1];
      if (node.type !== 'd') return;
      const na = node.na, sig = strat[node.di], p = node.player;
      for (let a = 0; a < na; a++) {
        const nr = new Float64Array(N), src = p === 0 ? r0 : r1;
        for (let h = 0; h < N; h++) nr[h] = src[h] * sig[h * na + a];
        down(node.children[a], p === 0 ? nr : r0, p === 0 ? r1 : nr);
      }
    })(g.root, g.w[0], g.w[1]);
    for (let p = 0; p < 2; p++) (function up(node) {
      const out = new Float64Array(N);
      if (node.type !== 'd') { leafValue(g, node, p, view[node.id].reach[1 - p], out); }
      else {
        const na = node.na, sig = strat[node.di];
        for (let a = 0; a < na; a++) {
          const v = up(node.children[a]);
          if (node.player === p) for (let h = 0; h < N; h++) out[h] += sig[h * na + a] * v[h];
          else for (let h = 0; h < N; h++) out[h] += v[h];
        }
      }
      view[node.id].ev[p] = out;
      return out;
    })(g.root);
    let v0 = 0; for (let h = 0; h < N; h++) v0 += g.w[0][h] * view[g.root.id].ev[0][h];
    view.value0 = v0 / g.Z;                       // zero-sum value for the out-of-position player
    return view;
  }
  // compatible opponent mass for each hand: m[i] = sum_j r[j] [no shared card]
  function oppMass(g, r) { const out = new Float64Array(g.N); foldEval(g, r, out); return out; }

  const api = { RANKS, SUITS, cardOf, cardStr, eval7, categoryOf, classOf, className, parseRange, rangeToString, createGame,
                Solver, exploitability, analyse, oppMass, ALGOS, foldEval, showdownEval,
                BB_CALL: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o,87o,-QQ+,-AKs,-AKo,-A5s',
                BTN_OPEN: '22+,A2s+,K5s+,Q8s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,A7o+,K9o+,QTo+,JTo' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PokerSolver = api;
})(typeof self !== 'undefined' ? self : this);
