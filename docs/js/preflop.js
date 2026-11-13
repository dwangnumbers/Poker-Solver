/* Preflop solver for 2 to 6 players over the 169 starting-hand classes, with DCFR (alternating updates).
   Terminal values:
     fold:      the last player in wins the pot;
     showdown:  the pot is split by all-in equity among the 2 or 3 players left (postflop play is not modelled).
   Card removal: M[i][j] = (compatible combo pairs of classes i, j) / (combos of i * combos of j) is exact for two
   players; with more players, opponents are treated as independent given the hero's hand.
   Three-way equity F[i][j][k] (symmetric in j, k) is used through a symmetric low-rank factorisation for each i:
     F_i ~ sum_r lambda_ir u_ir u_ir^T,  so  sum_jk a_j b_k F_i(j,k) ~ sum_r lambda_ir (u_ir . a)(u_ir . b).
   With two players the game is zero-sum and DCFR converges to an equilibrium of this abstraction; with three or more
   players there is no such guarantee and the solver reports the measured NashConv (sum of best-response gains). */
(function (root) {
  'use strict';
  const isNode = typeof window === 'undefined' && typeof importScripts === 'undefined';
  const E = isNode ? require('./engine.js') : root.PSEngine;
  const NC = 169;
  const CNT = Float64Array.from({ length: NC }, (_, k) => E.CLASS_COMBOS(k));
  const NAMES = { 2: ['SB', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['CO', 'BTN', 'SB', 'BB'], 5: ['HJ', 'CO', 'BTN', 'SB', 'BB'], 6: ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] };

  /* tables: { c2: Uint16Array(169^2), eq2: Float32Array(169^2), eq3r: { R, lam: Float32Array(169 R), U: Float32Array(169 R 169) } } */
  function prepare(raw) {
    const M = new Float64Array(NC * NC), ME = new Float64Array(NC * NC), E2 = Float64Array.from(raw.eq2);
    for (let i = 0; i < NC; i++) for (let j = 0; j < NC; j++) { const m = raw.c2[i * NC + j] / (CNT[i] * CNT[j]); M[i * NC + j] = m; ME[i * NC + j] = m * raw.eq2[i * NC + j]; }
    // M = 1 - D with D nonzero only for classes that share a rank (about a third of the pairs): sparse rows of D
    const Dp = new Int32Array(NC + 1), Dj = [], Dv = [], DEv = [];
    for (let i = 0; i < NC; i++) { for (let j = 0; j < NC; j++) { const d = 1 - M[i * NC + j]; if (d > 1e-12) { Dj.push(j); Dv.push(d); DEv.push(d * raw.eq2[i * NC + j]); } } Dp[i + 1] = Dj.length; }
    return { M, ME, E2, eq2: raw.eq2, Dp, Dj: Int32Array.from(Dj), Dv: Float64Array.from(Dv), DEv: Float64Array.from(DEv),
      R: raw.eq3r ? raw.eq3r.R : 0, lam: raw.eq3r ? raw.eq3r.lam : null, U: raw.eq3r ? raw.eq3r.U : null };
  }
  function matvec(A, x, out) { for (let i = 0, o = 0; i < NC; i++, o += NC) { let s = 0; for (let j = 0; j < NC; j++) s += A[o + j] * x[j]; out[i] = s; } return out; }
  /* (M x)_i = sum_j x_j - sum_{j shares a rank with i} D_ij x_j, in about a third of the dense cost */
  function mvM(tab, x, out) { let t = 0; for (let j = 0; j < NC; j++) t += x[j]; const P = tab.Dp, J = tab.Dj, V = tab.Dv; for (let i = 0; i < NC; i++) { let s = t; for (let k = P[i]; k < P[i + 1]; k++) s -= V[k] * x[J[k]]; out[i] = s; } return out; }
  function mvME(tab, x, out) { matvec(tab.E2, x, out); const P = tab.Dp, J = tab.Dj, V = tab.DEv; for (let i = 0; i < NC; i++) { let s = 0; for (let k = P[i]; k < P[i + 1]; k++) s += V[k] * x[J[k]]; out[i] -= s; } return out; }

  const DEFAULTS = { players: 6, stack: 100, sb: 0.5, bb: 1, ante: 0, open: 2.5, sbOpen: 3, threebetIP: 3, threebetOOP: 4, fourbet: 2.3,
    allin: true, maxRaises: 4, sbLimp: true, maxToFlop: 2, allinThreshold: 0.4 };

  /* ---------------------------------------------------------------- tree */
  function buildTree(cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg);
    const N = cfg.players, names = NAMES[N], S = cfg.stack;
    // postflop order: SB 0, BB 1, then the others in seat order; heads-up the small blind is the button and acts last
    const post = p => N === 2 ? 1 - p : (p - (N - 2) + N) % N;
    const tree = { cfg, N, names, decisions: [], terminals: 0, nodes: 0 };
    const deadAnte = cfg.ante * N;
    function node(st) {
      tree.nodes++;
      const inP = []; for (let p = 0; p < N; p++) if (!st.folded[p]) inP.push(p);
      if (inP.length === 1) return term(st, inP);
      // next player to act
      let p = st.next, guard = 0;
      while ((st.folded[p] || st.allin[p] || !st.need[p]) && guard++ < N) p = (p + 1) % N;
      if (guard >= N || !st.need[p] || st.folded[p] || st.allin[p]) return term(st, inP);
      const bet = Math.max(...st.c), me = st.c[p], facing = bet > me + 1e-9;
      const d = { t: 'd', p, c: st.c.slice(), acts: [], ch: [], id: tree.decisions.length, na: 0, R: null, S: null, lock: null };
      tree.decisions.push(d);
      const add = (kind, to, label, nst) => { d.acts.push({ kind, to, label }); d.ch.push(node(nst)); };
      const atLevel = inP.filter(q => Math.abs(st.c[q] - bet) < 1e-9 && q !== p).length;
      const live = inP.filter(q => !st.allin[q]).length;
      if (facing) {
        add('fold', me, 'fold', next(st, p, s => { s.folded[p] = true; }));
        const callTo = Math.min(bet, S);
        if (atLevel + 1 <= cfg.maxToFlop) add(callTo >= S - 1e-9 ? 'allin' : 'call', callTo, callTo >= S - 1e-9 ? 'call all-in' : 'call', next(st, p, s => { s.c[p] = callTo; if (callTo >= S - 1e-9) s.allin[p] = true; }));
      } else add('check', me, 'check', next(st, p, () => {}));
      // raises
      const anyAllin = inP.some(q => st.allin[q]);
      if (!anyAllin && st.raises < cfg.maxRaises && me < S - 1e-9 && live >= 2) {
        let to;
        if (st.raises === 0) to = p >= N - 2 ? cfg.sbOpen : cfg.open;            // the blinds open (or raise a limp) larger
        else { const ip = post(p) > post(st.aggr); to = st.raises === 1 ? bet * (ip ? cfg.threebetIP : cfg.threebetOOP) : bet * cfg.fourbet; }
        const sizes = [];
        if (to < cfg.allinThreshold * S && to > bet + 1e-9) sizes.push(to);
        if (cfg.allin || sizes.length === 0) sizes.push(S);
        for (const x of sizes) {
          const all = x >= S - 1e-9;
          add(all ? 'allin' : 'raise', x, all ? 'all-in' : (st.raises === 0 ? 'raise ' : st.raises === 1 ? '3-bet ' : (st.raises + 2) + '-bet ') + fmt(x),
            next(st, p, s => { s.c[p] = x; if (all) s.allin[p] = true; s.raises++; s.aggr = p; for (let q = 0; q < N; q++) s.need[q] = q !== p && !s.folded[q] && !s.allin[q]; }));
        }
      }
      // the small blind may limp: completing is a call of one big blind, offered only when unopened
      d.na = d.acts.length;
      return d;
    }
    function next(st, p, f) {
      const s = { c: st.c.slice(), folded: st.folded.slice(), allin: st.allin.slice(), need: st.need.slice(), raises: st.raises, aggr: st.aggr, next: (p + 1) % N };
      s.need[p] = false; f(s); return s;
    }
    function term(st, inP) {
      tree.terminals++;
      const pot = st.c.reduce((a, b) => a + b, 0) + deadAnte;
      return { t: inP.length === 1 ? 'f' : 's', in: inP, c: st.c.slice(), pot, ante: cfg.ante };
    }
    const c0 = new Array(N).fill(0); c0[N - 2] = cfg.sb; c0[N - 1] = cfg.bb;
    if (N === 2) { c0[0] = cfg.sb; c0[1] = cfg.bb; }
    const need = new Array(N).fill(true);
    const st = { c: c0, folded: new Array(N).fill(false), allin: new Array(N).fill(false), need, raises: 0, aggr: N - 1, next: 0 };
    // unopened: open-limping is allowed only for the small blind (if sbLimp)
    tree.root = node(st);
    pruneLimps(tree.root);
    function pruneLimps(n) {
      if (n.t !== 'd') return;
      if (Math.max(...n.c) <= cfg.bb + 1e-9 && n.acts.length && n.acts[1] && n.acts[1].kind === 'call' && n.c[n.p] < cfg.bb - 1e-9) {
        const isSB = n.p === (N === 2 ? 0 : N - 2);
        if (!(isSB && cfg.sbLimp)) { n.acts.splice(1, 1); n.ch.splice(1, 1); n.na = n.acts.length; }
        else n.acts[1].label = 'limp';
      }
      n.ch.forEach(pruneLimps);
    }
    tree.decisions = []; (function collect(n) { if (n.t !== 'd') return; n.id = tree.decisions.length; tree.decisions.push(n); n.ch.forEach(collect); })(tree.root);
    for (const d of tree.decisions) { d.R = new Float32Array(NC * d.na); d.S = new Float32Array(NC * d.na); }
    return tree;
  }
  const fmt = x => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));

  /* ---------------------------------------------------------------- solver */
  function Solver(tree, tab, opts) {
    opts = opts || {};
    this.tree = tree; this.tab = tab; this.t = 0; this.alpha = opts.alpha ?? 1.5; this.beta = opts.beta ?? 0; this.gamma = opts.gamma ?? 2;
    this.ranges = (opts.ranges || []).length ? opts.ranges : null;
    this.w0 = []; for (let p = 0; p < tree.N; p++) { const r = new Float64Array(NC); for (let k = 0; k < NC; k++) r[k] = CNT[k] * (this.ranges ? this.ranges[p][k] : 1); this.w0.push(r); }
    this.tmp = Array.from({ length: 8 }, () => new Float64Array(NC));
    this.cache = new WeakMap();
  }
  /* current (regret matching) or average strategy at d, action-major (entry a * 169 + i) */
  function strategy(d, avg, out) {
    const na = d.na, X = avg ? d.S : d.R;
    if (d.lock) { out.set(d.lock); return out; }
    for (let i = 0; i < NC; i++) {
      let s = 0; for (let a = 0; a < na; a++) { const x = X[a * NC + i]; if (avg || x > 0) s += x; }
      for (let a = 0; a < na; a++) { const x = X[a * NC + i]; out[a * NC + i] = s > 0 ? ((avg || x > 0) ? x / s : 0) : 1 / na; }
    }
    return out;
  }
  /* terminal value of player p, per class, given everyone's reach */
  /* M r and (M o E2) r for a reach vector, cached: the reach vector of a player is one object shared by every leaf
     below the node where it was formed, so each product is computed once per traversal */
  Solver.prototype.cM = function (x) { let c = this.cache.get(x); if (!c) { c = {}; this.cache.set(x, c); } return c.m || (c.m = mvM(this.tab, x, new Float64Array(NC))); };
  Solver.prototype.cME = function (x) { let c = this.cache.get(x); if (!c) { c = {}; this.cache.set(x, c); } return c.me || (c.me = mvME(this.tab, x, new Float64Array(NC))); };
  Solver.prototype.leaf = function (n, p, r) {
    const tab = this.tab, out = new Float64Array(NC), W = this.tmp[0].fill(1), cp = n.c[p] + n.ante;
    const others = [], shown = [];
    for (let q = 0; q < this.tree.N; q++) if (q !== p) { others.push(q); if (n.in.includes(q)) shown.push(q); }
    const pin = n.in.includes(p);
    // product over the players not in the showdown with p of their compatible weight
    for (const q of others) if (!(pin && n.t === 's' && shown.includes(q))) { const w = this.cM(r[q]); for (let i = 0; i < NC; i++) W[i] *= w[i]; }
    if (!pin) { for (let i = 0; i < NC; i++) out[i] = -cp * W[i]; return out; }
    if (n.t === 'f') { for (let i = 0; i < NC; i++) out[i] = (n.pot - cp) * W[i]; return out; }
    if (shown.length === 1) {
      const q = shown[0], m = this.cM(r[q]), me = this.cME(r[q]);
      for (let i = 0; i < NC; i++) out[i] = W[i] * (n.pot * me[i] - cp * m[i]);
      return out;
    }
    // three-way: sum_jk (r1_j M_ij)(r2_k M_ik) F_i(j,k) by the low-rank factors
    const [q1, q2] = shown, R = tab.R, U = tab.U, lam = tab.lam, a = this.tmp[2], b = this.tmp[3];
    const m1 = this.cM(r[q1]), m2 = this.cM(r[q2]);
    for (let i = 0; i < NC; i++) {
      const Mi = i * NC; for (let j = 0; j < NC; j++) { a[j] = r[q1][j] * tab.M[Mi + j]; b[j] = r[q2][j] * tab.M[Mi + j]; }
      let s = 0;
      for (let k = 0; k < R; k++) { const base = (i * R + k) * NC; let ua = 0, ub = 0; for (let j = 0; j < NC; j++) { ua += U[base + j] * a[j]; ub += U[base + j] * b[j]; } s += lam[i * R + k] * ua * ub; }
      out[i] = W[i] * (n.pot * s - cp * m1[i] * m2[i]);
    }
    return out;
  };
  /* mode 0: DCFR update for p; 1: best response of p to the average profile; 2: value of the average profile */
  Solver.prototype.walk = function (n, p, r, mode) {
    if (n.t !== 'd') return this.leaf(n, p, r);
    const na = n.na, sig = new Float64Array(NC * na); strategy(n, mode !== 0, sig);
    if (n.p !== p) {
      const out = new Float64Array(NC), q = n.p;
      for (let a = 0; a < na; a++) {
        const rq = new Float64Array(NC); let any = false; for (let i = 0; i < NC; i++) { rq[i] = r[q][i] * sig[a * NC + i]; if (rq[i] > 0) any = true; }
        if (!any) continue;
        const r2 = r.slice(); r2[q] = rq; const v = this.walk(n.ch[a], p, r2, mode);
        for (let i = 0; i < NC; i++) out[i] += v[i];
      }
      return out;
    }
    const act = [], out = new Float64Array(NC);
    for (let a = 0; a < na; a++) {
      const rp = new Float64Array(NC); for (let i = 0; i < NC; i++) rp[i] = r[p][i] * sig[a * NC + i];
      const r2 = r.slice(); r2[p] = mode === 1 ? r[p] : rp; act.push(this.walk(n.ch[a], p, r2, mode));
    }
    if (mode === 1 && !n.lock) { for (let i = 0; i < NC; i++) { let m = -Infinity; for (let a = 0; a < na; a++) m = Math.max(m, act[a][i]); out[i] = m; } return out; }
    for (let i = 0; i < NC; i++) { let s = 0; for (let a = 0; a < na; a++) s += sig[a * NC + i] * act[a][i]; out[i] = s; }
    if (mode === 0 && !n.lock) {
      const t = this.t, disc = e => e === Infinity ? 1 : e === -Infinity ? 0 : Math.pow(t, e) / (Math.pow(t, e) + 1);
      const dp = disc(this.alpha), dn = disc(this.beta), sw = Math.pow(t / (t + 1), this.gamma);
      for (let a = 0; a < na; a++) for (let i = 0; i < NC; i++) {
        const k = a * NC + i, x = n.R[k]; n.R[k] = (x > 0 ? x * dp : x * dn) + (act[a][i] - out[i]);
        n.S[k] = n.S[k] * sw + r[p][i] * sig[k];
      }
    }
    return out;
  };
  Solver.prototype.iterate = function (k) {
    for (let it = 0; it < (k || 1); it++) { this.t++; for (let p = 0; p < this.tree.N; p++) this.walk(this.tree.root, p, this.w0.slice(), 0); }
  };
  /* values (bb per hand) of the average profile, best-response values, NashConv = sum of gains */
  Solver.prototype.evaluate = function () {
    const N = this.tree.N, val = [], br = [];
    // total deal weight of the hero's class i: product of compatible weights of everyone else (independence model)
    for (let p = 0; p < N; p++) {
      const v = this.walk(this.tree.root, p, this.w0.slice(), 2), b = this.walk(this.tree.root, p, this.w0.slice(), 1);
      const z = this.norm(p);
      let sv = 0, sb = 0, sz = 0; for (let i = 0; i < NC; i++) { sv += this.w0[p][i] * v[i]; sb += this.w0[p][i] * b[i]; sz += this.w0[p][i] * z[i]; }
      val.push(sv / sz); br.push(sb / sz);
    }
    const gains = br.map((b, p) => b - val[p]);
    return { val, br, gains, nashConv: gains.reduce((a, b) => a + b, 0), expl: gains.reduce((a, b) => a + b, 0) / N };
  };
  Solver.prototype.norm = function (p) {
    const z = new Float64Array(NC).fill(1), w = new Float64Array(NC);
    for (let q = 0; q < this.tree.N; q++) if (q !== p) { mvM(this.tab, this.w0[q], w); for (let i = 0; i < NC; i++) z[i] *= w[i]; }
    return z;
  };
  /* node analysis: strategy of the player to act per class, everyone's reach, EV per class of the player to act */
  Solver.prototype.analyse = function (path) {
    let n = this.tree.root; const r = this.w0.map(x => Float64Array.from(x));
    for (const a of path) { const sig = new Float64Array(NC * n.na); strategy(n, true, sig); for (let i = 0; i < NC; i++) r[n.p][i] *= sig[a * NC + i]; n = n.ch[a]; }
    const out = { node: n, reach: r };
    if (n.t === 'd') {
      const sig = new Float64Array(NC * n.na); strategy(n, true, sig); out.strategy = sig;
      const p = n.p, z = new Float64Array(NC).fill(1), w = new Float64Array(NC);
      for (let q = 0; q < this.tree.N; q++) if (q !== p) { mvM(this.tab, r[q], w); for (let i = 0; i < NC; i++) z[i] *= w[i]; }
      // action values per class, normalised by the weight of the deals reaching here: EV in bb per hand
      out.actEV = n.ch.map((c, a) => { const v = this.walk(c, p, r.map((x, q) => q === p ? x : x), 2); return Float64Array.from(v, (x, i) => z[i] > 1e-12 ? x / z[i] : NaN); });
      out.ev = Float64Array.from({ length: NC }, (_, i) => { let s = 0; for (let a = 0; a < n.na; a++) s += sig[a * NC + i] * out.actEV[a][i]; return s; });
      out.freq = Array.from({ length: n.na }, (_, a) => { let s = 0, t = 0; for (let i = 0; i < NC; i++) { const x = r[p][i] * z[i]; s += x * sig[a * NC + i]; t += x; } return t > 0 ? s / t : 0; });
    }
    return out;
  };
  /* loading the tables: in a browser from data/, in Node from web/data */
  async function loadTables(base) {
    const get = async (name, T) => {
      if (isNode) { const b = require('fs').readFileSync(require('path').join(__dirname, '..', 'data', name)); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
      const res = await fetch((base || 'data/') + name); if (!res.ok) throw new Error('cannot load ' + name); return new T(await res.arrayBuffer());
    };
    const c2 = await get('c2.u16', Uint16Array), eq2 = await get('eq2.f32', Float32Array), f3 = await get('eq3r.f32', Float32Array);
    const R = f3[0] | 0, lam = f3.subarray(1, 1 + NC * R), U = f3.subarray(1 + NC * R);
    return prepare({ c2, eq2, eq3r: { R, lam, U } });
  }
  const api = { NAMES, DEFAULTS, CNT, buildTree, Solver, strategy, loadTables, prepare, matvec, mvM, mvME };
  if (isNode && typeof module !== 'undefined') module.exports = api; else root.PSPreflop = api;
})(typeof self !== 'undefined' ? self : this);
