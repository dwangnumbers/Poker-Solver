/* Postflop engine: range-vectorized DCFR on multi-street hold'em trees (flop, turn, river).

   Numerical design
   - Public tree: decision nodes (one player acts), chance nodes (a turn or river card is dealt) and leaves (fold or showdown).
   - Each player keeps a list of the two-card hands in her range that do not touch the starting board. Every vector below is
     indexed by that list.
   - A leaf costs O(n): folds use per-card sums (card removal by inclusion-exclusion), showdowns use one merged sort of both
     lists by hand strength per final board and two sweeps.
   - A chance node averages its children with weight 1/(48 - |board|): for two fixed hands, exactly that many cards remain.
   - Regrets and strategy sums are Float32; values are accumulated in Float64.
   - DCFR(alpha, beta, gamma) with alternating updates. Node locking fixes a node's strategy for every hand.
   Pure functions; no DOM. Runs in a Web Worker, in the page, or in Node for tests. */
(function (root) {
  'use strict';
  const RANKS = '23456789TJQKA', SUITS = 'cdhs';
  const cardOf = s => RANKS.indexOf(s[0].toUpperCase()) * 4 + SUITS.indexOf(s[1].toLowerCase());
  const cardStr = c => RANKS[c >> 2] + SUITS[c & 3];
  const STREETS = ['flop', 'turn', 'river'];

  // ------------------------------------------------------------------ 7-card evaluator (larger = stronger)
  const STRAIGHT = new Int8Array(1 << 13).fill(-1);       // rank mask -> high card of best straight, or -1
  for (let m = 0; m < 1 << 13; m++) {
    for (let hi = 12; hi >= 4; hi--) if (((m >> (hi - 4)) & 31) === 31) { STRAIGHT[m] = hi; break; }
    if (STRAIGHT[m] < 0 && (m & 0x100F) === 0x100F) STRAIGHT[m] = 3;
  }
  const POP = new Int8Array(1 << 13); for (let m = 1; m < 1 << 13; m++) POP[m] = POP[m >> 1] + (m & 1);
  const TOPK = (mask, k) => { let v = 0, n = 0; for (let r = 12; r >= 0 && n < k; r--) if (mask >> r & 1) { v = v * 13 + r; n++; } while (n < k) { v *= 13; n++; } return v; };
  const B5 = 371293;                                     // 13^5
  /* cards: array-like of 5..7 ints */
  function evalCards(cards, n) {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, rm = 0; const cnt = EV_CNT; cnt.fill(0);
    for (let i = 0; i < n; i++) {
      const c = cards[i], r = c >> 2, b = 1 << r; cnt[r]++; rm |= b;
      switch (c & 3) { case 0: s0 |= b; break; case 1: s1 |= b; break; case 2: s2 |= b; break; default: s3 |= b; }
    }
    let fm = POP[s0] >= 5 ? s0 : POP[s1] >= 5 ? s1 : POP[s2] >= 5 ? s2 : POP[s3] >= 5 ? s3 : 0;
    if (fm) { const sf = STRAIGHT[fm]; if (sf >= 0) return 8 * B5 + sf; }
    let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1, p3 = -1;
    for (let r = 12; r >= 0; r--) {
      const k = cnt[r];
      if (k === 4) quad = r; else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
    }
    if (quad >= 0) return 7 * B5 + quad * 13 + TOPK(rm & ~(1 << quad), 1);
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return 6 * B5 + t1 * 13 + Math.max(t2, p1);
    if (fm) return 5 * B5 + TOPK(fm, 5);
    const st = STRAIGHT[rm]; if (st >= 0) return 4 * B5 + st;
    if (t1 >= 0) return 3 * B5 + t1 * 169 + TOPK(rm & ~(1 << t1), 2);
    if (p2 >= 0) return 2 * B5 + p1 * 169 + p2 * 13 + TOPK(rm & ~(1 << p1) & ~(1 << p2), 1);
    if (p1 >= 0) return 1 * B5 + p1 * 2197 + TOPK(rm & ~(1 << p1), 3);
    return TOPK(rm, 5);
  }
  const EV_CNT = new Int8Array(13);
  const CATEGORY = ['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'flush', 'full house', 'four of a kind', 'straight flush'];
  const categoryOf = v => CATEGORY[Math.floor(v / B5)];

  // ------------------------------------------------------------------ hands, classes, range notation
  const COMBO_A = new Int8Array(1326), COMBO_B = new Int8Array(1326), COMBO_ID = new Int16Array(52 * 52).fill(-1);
  { let k = 0; for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) { COMBO_A[k] = a; COMBO_B[k] = b; COMBO_ID[a * 52 + b] = COMBO_ID[b * 52 + a] = k; k++; } }
  function classOf(a, b) {
    let r1 = a >> 2, r2 = b >> 2; if (r1 < r2) { const t = r1; r1 = r2; r2 = t; }
    const i = 12 - r1, j = 12 - r2;
    if (r1 === r2) return i * 13 + i;
    return (a & 3) === (b & 3) ? i * 13 + j : j * 13 + i;
  }
  function className(k) {
    const i = Math.floor(k / 13), j = k % 13, R = x => RANKS[12 - x];
    if (i === j) return R(i) + R(i);
    return i < j ? R(i) + R(j) + 's' : R(j) + R(i) + 'o';
  }
  const COMBO_CLASS = new Int16Array(1326); for (let k = 0; k < 1326; k++) COMBO_CLASS[k] = classOf(COMBO_A[k], COMBO_B[k]);
  const CLASS_COMBOS = (k) => { const i = Math.floor(k / 13), j = k % 13; return i === j ? 6 : i < j ? 4 : 12; };
  /* "22+, A2s+, KTo+, 98s, -QQ+, AKs:0.5" -> Float64Array(169) */
  function parseRange(spec) {
    const w = new Float64Array(169);
    const idx = (hi, lo, kind) => kind === 'p' ? (12 - hi) * 14 : kind === 's' ? (12 - hi) * 13 + (12 - lo) : (12 - lo) * 13 + (12 - hi);
    for (let tok of String(spec).split(/[,\s]+/)) {
      if (!tok) continue;
      let val = 1; const neg = tok[0] === '-'; if (neg) tok = tok.slice(1);
      const colon = tok.indexOf(':'); if (colon >= 0) { val = Math.max(0, Math.min(1, parseFloat(tok.slice(colon + 1)) || 0)); tok = tok.slice(0, colon); }
      let dash = null; const m = tok.match(/^([2-9TJQKA]{2}[so]?)-([2-9TJQKA]{2}[so]?)$/i); if (m) { dash = m; }
      const set = k => { w[k] = neg ? 0 : val; };
      if (dash) {                                    // e.g. KTs-K6s, 99-55
        const a = norm(dash[1]), b = norm(dash[2]); if (!a || !b) continue;
        if (a.pair && b.pair) { const lo = Math.min(a.hi, b.hi), hi = Math.max(a.hi, b.hi); for (let r = lo; r <= hi; r++) set(idx(r, r, 'p')); }
        else if (a.hi === b.hi && !a.pair) { const lo = Math.min(a.lo, b.lo), hi = Math.max(a.lo, b.lo); for (const kind of a.kinds) for (let r = lo; r <= hi; r++) set(idx(a.hi, r, kind)); }
        continue;
      }
      const plus = tok.endsWith('+'); if (plus) tok = tok.slice(0, -1);
      const h = norm(tok); if (!h) continue;
      if (h.pair) { for (let r = h.hi; r <= (plus ? 12 : h.hi); r++) set(idx(r, r, 'p')); }
      else for (const kind of h.kinds) for (let r = h.lo; r <= (plus ? h.hi - 1 : h.lo); r++) set(idx(h.hi, r, kind));
    }
    return w;
    function norm(t) {
      if (t.length < 2) return null;
      const a = RANKS.indexOf(t[0].toUpperCase()), b = RANKS.indexOf(t[1].toUpperCase()); if (a < 0 || b < 0) return null;
      if (a === b) return { pair: true, hi: a };
      const k = (t[2] || '').toLowerCase();
      return { pair: false, hi: Math.max(a, b), lo: Math.min(a, b), kinds: k === 's' ? ['s'] : k === 'o' ? ['o'] : ['s', 'o'] };
    }
  }
  function rangeToString(w) {
    const out = [];
    for (let k = 0; k < 169; k++) if (w[k] > 0) out.push(className(k) + (w[k] < 0.999 ? ':' + (+w[k].toFixed(3)) : ''));
    return out.join(',');
  }

  // ------------------------------------------------------------------ bet tree
  /* tree config:
     { streets: { flop: { oop: { bet:[33,75], raise:[100], allin:true }, ip: {...} }, turn: {...}, river: {...} },
       maxBets: 3,            bets plus raises allowed per street
       allinThreshold: 0.67,  a bet or raise that would leave less than (1 - threshold) of the stack becomes all-in
       mergeTolerance: 0.1 }  sizes closer than this fraction of the pot are merged
     Sizes are percentages of the pot: a bet of 75 bets 75% of the pot; a raise of 100 raises by 100% of the pot after calling. */
  const DEFAULT_TREE = () => ({
    streets: {
      flop: { oop: { bet: [33], raise: [], allin: false }, ip: { bet: [33, 75], raise: [100], allin: false } },
      turn: { oop: { bet: [66], raise: [], allin: false }, ip: { bet: [66], raise: [100], allin: false } },
      river: { oop: { bet: [75], raise: [], allin: true }, ip: { bet: [75], raise: [100], allin: true } },
    },
    maxBets: 3, allinThreshold: 0.67, mergeTolerance: 0.1,
  });

  /* game config:
     { board: [ints], pot, stack (effective, behind), ranges: [Float64Array(169) or Float64Array(1326)] x2,
       tree, rake: { pct, cap } }   player 0 = out of position, player 1 = in position */
  function buildGame(cfg, part) {
    /* part (optional): { own: array of 52 booleans } builds, below each chance node of the first chance level, only the
       children for owned cards. part = { topOnly: true } builds no children there at all (the coordinator's tree). */
    const board0 = cfg.board.slice();
    if (board0.length < 3 || board0.length > 5) throw new Error('board must have 3, 4 or 5 cards');
    if (new Set(board0).size !== board0.length) throw new Error('duplicate board card');
    const street0 = board0.length - 3;
    const P = +cfg.pot, S = +cfg.stack;
    const tree = cfg.tree || DEFAULT_TREE();
    const rake = cfg.rake || { pct: 0, cap: 0 };
    const usedB = new Uint8Array(52); for (const c of board0) usedB[c] = 1;
    // hand lists
    const L = [], W = [], LA = [], LB = [], cls = [];
    for (let p = 0; p < 2; p++) {
      const r = cfg.ranges[p], perCombo = r.length === 1326;
      const ids = [], ws = [];
      for (let k = 0; k < 1326; k++) {
        if (usedB[COMBO_A[k]] || usedB[COMBO_B[k]]) continue;
        const x = perCombo ? r[k] : r[COMBO_CLASS[k]];
        if (x > 0) { ids.push(k); ws.push(x); }
      }
      L.push(Int16Array.from(ids)); W.push(Float64Array.from(ws));
      LA.push(Int8Array.from(ids.map(k => COMBO_A[k]))); LB.push(Int8Array.from(ids.map(k => COMBO_B[k])));
      cls.push(Int16Array.from(ids.map(k => COMBO_CLASS[k])));
    }
    if (!L[0].length || !L[1].length) throw new Error('a range is empty on this board');
    const n = [L[0].length, L[1].length];
    // hands of player p containing card c; position in the other list of the same combo
    const withCard = [0, 1].map(p => { const lists = Array.from({ length: 52 }, () => []); for (let i = 0; i < n[p]; i++) { lists[LA[p][i]].push(i); lists[LB[p][i]].push(i); } return lists.map(a => Int32Array.from(a)); });
    const same = [0, 1].map(p => { const pos = new Int32Array(1326).fill(-1); const q = 1 - p; for (let j = 0; j < n[q]; j++) pos[L[q][j]] = j; return Int32Array.from(L[p], k => pos[k]); });

    const g = { cfg, board: board0, street0, pot: P, stack: S, tree, rake, L, W, LA, LB, cls, n, withCard, same,
                nodes: 0, decisions: [], runouts: new Map(), memBytes: 0, top: [], part: part || null };
    const maxBets = tree.maxBets == null ? 3 : tree.maxBets, thr = tree.allinThreshold == null ? 0.67 : tree.allinThreshold;
    const tol = tree.mergeTolerance == null ? 0.1 : tree.mergeTolerance;

    function sizesFor(st, p, kind, potNow, toCall, myC, otherC) {
      const conf = tree.streets[STREETS[st]][p === 0 ? 'oop' : 'ip'];
      const list = (kind === 'bet' ? conf.bet : conf.raise) || [];
      const behind = S - myC;
      const out = [];
      for (const pct of list) {
        let to = kind === 'bet' ? myC + pct / 100 * potNow : otherC + pct / 100 * (potNow + toCall);
        if (to - myC >= thr * behind) to = S;               // threshold: becomes all-in
        to = Math.min(to, S);
        if (to > otherC + 1e-9) out.push(to);
      }
      if (conf.allin && S > otherC + 1e-9) out.push(S);
      out.sort((a, b) => a - b);
      const merged = [];
      for (const x of out) if (!merged.length || (x - merged[merged.length - 1]) > tol * potNow || (x >= S && merged[merged.length - 1] < S)) merged.push(x); else if (x >= S) merged[merged.length - 1] = S;
      return [...new Set(merged)];
    }
    const potOf = (c0, c1) => P + c0 + c1;
    function payoffs(c0, c1, kind, folder) {      // per-player payoffs W (win), Lo (lose), T (tie), for player 0 and 1
      const tot = potOf(c0, c1);
      const rk = rake.pct > 0 ? Math.min(rake.pct / 100 * tot, rake.cap > 0 ? rake.cap : Infinity) : 0;
      const inv = [P / 2 + c0, P / 2 + c1];
      if (kind === 'fold') { const w = 1 - folder; const pay = [0, 0]; pay[w] = tot - rk - inv[w]; pay[folder] = -inv[folder]; return pay; }
      return [0, 1].map(p => ({ W: tot - rk - inv[p], Lo: -inv[p], T: (tot - rk) / 2 - inv[p] }));
    }

    function build(st, board, c0, c1, toAct, nBets, facing, checked, path) {
      // a player who can only check has no decision: skip the node
      let betSizes = null;
      if (!facing) {
        const myC0 = toAct === 0 ? c0 : c1, otherC0 = toAct === 0 ? c1 : c0;
        betSizes = nBets < maxBets && myC0 < S - 1e-9 ? sizesFor(st, toAct, 'bet', potOf(c0, c1), 0, myC0, otherC0) : [];
        if (!betSizes.length) return toAct === 0 ? build(st, board, c0, c1, 1, nBets, false, true) : endStreet(st, board, c0, c1);
      }
      g.nodes++;
      const node = { t: 'd', p: toAct, st, board, c: [c0, c1], acts: [], ch: [], R: null, S: null, lock: null, id: g.decisions.length };
      g.decisions.push(node);
      const me = toAct, other = 1 - me, myC = node.c[me], otherC = node.c[other], potNow = potOf(c0, c1);
      const add = (kind, to, child, label) => { node.acts.push({ kind, to, label }); node.ch.push(child); };
      if (facing) {
        add('fold', myC, leafFold(c0, c1, me), 'fold');
        const cc = [c0, c1]; cc[me] = otherC;
        add('call', otherC, afterCall(st, board, cc[0], cc[1]), 'call ' + fmt(otherC - myC));
        if (nBets < maxBets && otherC < S - 1e-9 && myC < S) {
          for (const to of sizesFor(st, me, 'raise', potNow, otherC - myC, myC, otherC)) {
            const nc = [c0, c1]; nc[me] = to;
            add(to >= S ? 'allin' : 'raise', to, build(st, board, nc[0], nc[1], other, nBets + 1, true, false), (to >= S ? 'all-in ' : 'raise to ') + fmt(to));
          }
        }
      } else {
        if (me === 0) add('check', myC, build(st, board, c0, c1, 1, nBets, false, true), 'check');
        else add('check', myC, endStreet(st, board, c0, c1), 'check');
        {
          for (const to of betSizes) {
            const nc = [c0, c1]; nc[me] = to;
            add(to >= S ? 'allin' : 'bet', to, build(st, board, nc[0], nc[1], other, nBets + 1, true, false), (to >= S ? 'all-in ' : 'bet ') + fmt(to - myC));
          }
        }
      }
      node.na = node.acts.length;
      return node;
    }
    function leafFold(c0, c1, folder) { g.nodes++; return { t: 'f', folder, c: [c0, c1], pay: payoffs(c0, c1, 'fold', folder) }; }
    function afterCall(st, board, c0, c1) {
      if (c0 >= S - 1e-9 || c1 >= S - 1e-9) return runout(st, board, c0, c1);     // all-in: deal the rest, then showdown
      return endStreet(st, board, c0, c1);
    }
    function endStreet(st, board, c0, c1) {
      if (board.length === 5) return leafShow(board, c0, c1);
      return chance(st, board, c0, c1, false);
    }
    function runout(st, board, c0, c1) {
      if (board.length === 5) return leafShow(board, c0, c1);
      return chance(st, board, c0, c1, true);
    }
    function chance(st, board, c0, c1, allin) {
      g.nodes++;
      const node = { t: 'c', st, board, c: [c0, c1], ch: new Array(52).fill(null), cards: [], allin, cid: -1 };
      const first = board.length === board0.length;
      if (first) { node.cid = g.top.length; g.top.push(node); }
      const used = new Uint8Array(52); for (const x of board) used[x] = 1;
      for (let c = 0; c < 52; c++) if (!used[c]) {
        node.all = node.all || []; node.all.push(c);
        if (first && part && (part.topOnly || !part.own[c])) continue;
        const nb = board.concat([c]);
        node.ch[c] = allin ? runout(st + 1, nb, c0, c1) : build(st + 1, nb, c0, c1, 0, 0, false, false);
        node.cards.push(c);
      }
      node.K = 48 - board.length;        // remaining cards once both hands are known
      return node;
    }
    function leafShow(board, c0, c1) {
      g.nodes++;
      const key = boardKey(board);
      if (!g.runouts.has(key)) g.runouts.set(key, { board: board.slice(), data: null });
      return { t: 's', c: [c0, c1], key, pay: payoffs(c0, c1, 'show') };
    }
    g.root = build(street0, board0, 0, 0, 0, 0, false, false);
    g.memBytes = g.decisions.reduce((s, d) => s + n[d.p] * d.na * 8, 0);
    // total deal weight
    g.Z = 0; { const t = new Float64Array(n[0]); foldMass(g, 0, W[1], t, null); for (let i = 0; i < n[0]; i++) g.Z += W[0][i] * t[i]; }
    return g;
  }
  const boardKey = b => b.slice().sort((x, y) => x - y).join('.');
  const fmt = x => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));

  // ------------------------------------------------------------------ leaf evaluation
  const CS = new Float64Array(52);
  /* out[i] = opponent weight compatible with own hand i (no shared card); also returns per-card sums in CS */
  function foldMass(g, p, ropp, out, dead) {
    const q = 1 - p, la = g.LA[q], lb = g.LB[q], n = g.n[q];
    let tot = 0; CS.fill(0);
    for (let j = 0; j < n; j++) { const x = ropp[j]; if (x !== 0) { tot += x; CS[la[j]] += x; CS[lb[j]] += x; } }
    const a = g.LA[p], b = g.LB[p], sm = g.same[p], m = g.n[p];
    for (let i = 0; i < m; i++) { const s = sm[i]; out[i] = tot - CS[a[i]] - CS[b[i]] + (s >= 0 ? ropp[s] : 0); }
    return tot;
  }
  function runoutData(g, key) {
    const ro = g.runouts.get(key);
    if (ro.data) return ro.data;
    const bd = ro.board, used = new Uint8Array(52); for (const c of bd) used[c] = 1;
    const cards = new Int8Array(7); for (let i = 0; i < 5; i++) cards[i] = bd[i];
    const data = { S: [], V: [], A: [], B: [], Q: [] };
    for (let p = 0; p < 2; p++) {
      const idx = [], str = [];
      for (let i = 0; i < g.n[p]; i++) {
        const a = g.LA[p][i], b = g.LB[p][i]; if (used[a] || used[b]) continue;
        cards[5] = a; cards[6] = b; idx.push(i); str.push(evalCards(cards, 7));
      }
      const ord = Array.from(idx.keys()).sort((x, y) => str[x] - str[y]);
      const S = Int32Array.from(ord, k => idx[k]);
      data.S.push(S); data.V.push(Int32Array.from(ord, k => str[k]));
      data.A.push(Int8Array.from(S, i => g.LA[p][i])); data.B.push(Int8Array.from(S, i => g.LB[p][i]));
      data.Q.push(Int32Array.from(S, i => g.same[p][i]));
    }
    ro.data = data;
    return data;
  }
  const WEAK = new Float64Array(1326), WEQ = new Float64Array(1326), RQ = new Float64Array(1326);
  /* Values of player p's hands at a showdown leaf, given the opponent's reach. One ascending sweep over both sorted
     lists gives, for each own hand, the compatible opponent weight that is strictly weaker and weaker-or-equal. */
  function showValue(g, leaf, p, ropp, out) {
    const d = runoutData(g, leaf.key), q = 1 - p;
    const So = d.S[p], Vo = d.V[p], Ao = d.A[p], Bo = d.B[p], Qo = d.Q[p];
    const Sq = d.S[q], Vq = d.V[q], Aq = d.A[q], Bq = d.B[q];
    const no = So.length, nq = Sq.length, cs = CS, rq = RQ, wk = WEAK, we = WEQ;
    for (let j = 0; j < nq; j++) rq[j] = ropp[Sq[j]];           // opponent reach in sorted order
    out.fill(0, 0, g.n[p]);
    let cum = 0, j = 0; cs.fill(0);
    for (let i = 0; i < no;) {
      const v = Vo[i];
      while (j < nq && Vq[j] < v) { const r = rq[j]; if (r !== 0) { cum += r; cs[Aq[j]] += r; cs[Bq[j]] += r; } j++; }
      const i0 = i;
      while (i < no && Vo[i] === v) { wk[i] = cum - cs[Ao[i]] - cs[Bo[i]]; i++; }
      while (j < nq && Vq[j] === v) { const r = rq[j]; if (r !== 0) { cum += r; cs[Aq[j]] += r; cs[Bq[j]] += r; } j++; }
      for (let t = i0; t < i; t++) { const s = Qo[t]; we[t] = cum - cs[Ao[t]] - cs[Bo[t]] + (s >= 0 ? ropp[s] : 0); }
    }
    while (j < nq) { const r = rq[j]; if (r !== 0) { cum += r; cs[Aq[j]] += r; cs[Bq[j]] += r; } j++; }
    const pay = leaf.pay[p], Wn = pay.W, Lo = pay.Lo, Ti = pay.T, c1 = Wn - Lo, c2 = Ti - Lo;
    for (let t = 0; t < no; t++) {
      const s = Qo[t], M = cum - cs[Ao[t]] - cs[Bo[t]] + (s >= 0 ? ropp[s] : 0), w = wk[t];
      out[So[t]] = Lo * M + c1 * w + c2 * (we[t] - w);
    }
    return out;
  }
  const TMP52 = new Float64Array(52);

  // ------------------------------------------------------------------ solver
  /* Buffers per recursion depth so that nothing is allocated inside the iteration. */
  function Solver(g, opts) {
    opts = opts || {};
    this.g = g; this.t = 0;
    this.alpha = opts.alpha == null ? 1.5 : opts.alpha; this.beta = opts.beta == null ? 0 : opts.beta; this.gamma = opts.gamma == null ? 2 : opts.gamma;
    const nmax = Math.max(g.n[0], g.n[1]);
    const FA = opts.precision === 64 ? Float64Array : Float32Array; this.precision = opts.precision === 64 ? 64 : 32;
    // regrets and strategy sums live in a few large blocks; each node holds two views into them
    const CHUNK = 1 << 24; let blockR = null, blockS = null, used = CHUNK;
    let maxA = 1;
    for (const d of g.decisions) {
      const len = g.n[d.p] * d.na;
      if (used + len > CHUNK) { const sz = Math.max(CHUNK, len); blockR = new FA(sz); blockS = new FA(sz); used = 0; }
      d.R = blockR.subarray(used, used + len); d.S = blockS.subarray(used, used + len); used += len;
      if (d.na > maxA) maxA = d.na;
    }
    this.maxA = maxA;
    const depth = 64; this.buf = [];
    for (let k = 0; k < depth; k++) this.buf.push({ val: new Float64Array(nmax), act: new Float64Array(nmax * maxA), ro: new Float64Array(nmax), rs: new Float64Array(nmax), sig: new Float64Array(nmax * maxA) });
    this.hist = [];
  }
  /* Layout: every per-node matrix is action-major, entry (hand i, action a) at a * n + i, so the inner loops run over
     contiguous memory. Locks are stored in the same layout. */
  /* current strategy at node d into out, by regret matching */
  function regretMatch(d, n, out, tmp) {
    const na = d.na, R = d.R;
    if (d.lock) { out.set(d.lock); return out; }
    tmp.fill(0, 0, n);
    for (let a = 0, o = 0; a < na; a++, o += n) for (let i = 0; i < n; i++) { const x = R[o + i]; if (x > 0) tmp[i] += x; }
    const u = 1 / na;
    for (let a = 0, o = 0; a < na; a++, o += n) for (let i = 0; i < n; i++) { const s = tmp[i], x = R[o + i]; out[o + i] = s > 0 ? (x > 0 ? x / s : 0) : u; }
    return out;
  }
  function averageStrategy(d, n, out, tmp) {
    const na = d.na, S = d.S;
    if (d.lock) { out.set(d.lock); return out; }
    tmp = tmp || new Float64Array(n); tmp.fill(0, 0, n);
    for (let a = 0, o = 0; a < na; a++, o += n) for (let i = 0; i < n; i++) tmp[i] += S[o + i];
    const u = 1 / na;
    for (let a = 0, o = 0; a < na; a++, o += n) for (let i = 0; i < n; i++) { const s = tmp[i]; out[o + i] = s > 0 ? S[o + i] / s : u; }
    return out;
  }
  /* hand-major copy (entry i * na + a), for the interface */
  function handMajor(d, n, am) { const na = d.na, out = new Float64Array(n * na); for (let a = 0; a < na; a++) for (let i = 0; i < n; i++) out[i * na + a] = am[a * n + i]; return out; }
  function actionMajor(d, n, hm) { const na = d.na, out = new Float32Array(n * na); for (let a = 0; a < na; a++) for (let i = 0; i < n; i++) out[a * n + i] = hm[i * na + a]; return out; }
  /* mode: 0 = DCFR update for player p; 1 = best response for p against the average strategy; 2 = value of the average
     profile; 3, 4 = coordinator's reach collection with the current (3) or average (4) strategy, no updates */
  Solver.prototype.walk = function (node, p, ro, rs, depth, mode) {
    const g = this.g, B = this.buf[depth], out = B.val, q = 1 - p, np = g.n[p], nq = g.n[q];
    if (node.t === 'f') {
      foldMass(g, p, ro, out, null); const pay = node.pay[p];
      for (let i = 0; i < np; i++) out[i] *= pay;
      return out;
    }
    if (node.t === 's') return showValue(g, node, p, ro, out);
    if (node.t === 'c') {
      if (node.cid >= 0 && this.collect) {        // coordinator, first pass: record reach at this chance node
        this.collect[node.cid] = { ro: Float64Array.from(ro.subarray(0, nq)), rs: Float64Array.from(rs.subarray(0, np)) };
        out.fill(0, 0, np); return out;
      }
      if (node.cid >= 0 && this.ext) { out.set(this.ext[node.cid].subarray(0, np)); return out; }
      out.fill(0, 0, np);
      const K = node.K, wcP = g.withCard[p], wcQ = g.withCard[q], cards = node.cards, ro2 = B.ro, rs2 = B.rs;
      for (let ci = 0; ci < cards.length; ci++) {
        const c = cards[ci], dq = wcQ[c], dp = wcP[c];
        for (let j = 0; j < nq; j++) ro2[j] = ro[j];
        for (let k = 0; k < dq.length; k++) ro2[dq[k]] = 0;
        let any = false; for (let j = 0; j < nq; j++) if (ro2[j] !== 0) { any = true; break; }
        if (!any) continue;                      // nothing reaches this card: its subtree contributes zero
        for (let i = 0; i < np; i++) rs2[i] = rs[i];
        for (let k = 0; k < dp.length; k++) rs2[dp[k]] = 0;
        const v = this.walk(node.ch[c], p, ro2, rs2, depth + 1, mode);
        for (let k = 0; k < dp.length; k++) v[dp[k]] = 0;
        for (let i = 0; i < np; i++) out[i] += v[i];
      }
      if (node.cid >= 0 && this.partial) return out;      // worker: sum over owned cards only; the coordinator divides
      const inv = 1 / K; for (let i = 0; i < np; i++) out[i] *= inv;
      return out;
    }
    // decision node
    const na = node.na, sig = B.sig, tmp = B.rs;
    if (node.p === p) {
      if (mode === 0 || mode === 3) regretMatch(node, np, sig, B.ro); else averageStrategy(node, np, sig, B.ro);
      const rs2 = B.rs;
      if (mode >= 3) {
        for (let a = 0, o = 0; a < na; a++, o += np) { for (let i = 0; i < np; i++) rs2[i] = rs[i] * sig[o + i]; this.walk(node.ch[a], p, ro, rs2, depth + 1, mode); }
        out.fill(0, 0, np); return out;
      }
      const act = B.act;
      for (let a = 0, o = 0; a < na; a++, o += np) {
        if (mode !== 1) for (let i = 0; i < np; i++) rs2[i] = rs[i] * sig[o + i];
        const v = this.walk(node.ch[a], p, ro, rs2, depth + 1, mode);
        for (let i = 0; i < np; i++) act[o + i] = v[i];
      }
      if (mode === 1 && !node.lock) {          // best response: max over actions
        for (let i = 0; i < np; i++) out[i] = act[i];
        for (let a = 1, o = np; a < na; a++, o += np) for (let i = 0; i < np; i++) { const x = act[o + i]; if (x > out[i]) out[i] = x; }
        return out;
      }
      for (let i = 0; i < np; i++) out[i] = sig[i] * act[i];
      for (let a = 1, o = np; a < na; a++, o += np) for (let i = 0; i < np; i++) out[i] += sig[o + i] * act[o + i];
      if (mode === 0 && !node.lock) {
        if (this._tf !== this.t) {
          const t = this.t, ta = Math.pow(t, this.alpha), tb = Math.pow(t, this.beta);
          this._dp = ta / (ta + 1); this._dn = this.beta < -1e6 ? 0 : tb / (tb + 1); this._sw = Math.pow(t / (t + 1), this.gamma); this._tf = t;
        }
        const R = node.R, S = node.S, dpf = this._dp, dnf = this._dn, sw = this._sw;
        for (let a = 0, o = 0; a < na; a++, o += np) {
          for (let i = 0; i < np; i++) {
            const r = R[o + i]; R[o + i] = (r > 0 ? r * dpf : r * dnf) + (act[o + i] - out[i]);
            S[o + i] = S[o + i] * sw + rs[i] * sig[o + i];
          }
        }
      }
      return out;
    }
    // opponent's node
    if (mode === 0 || mode === 3) regretMatch(node, nq, sig, B.ro); else averageStrategy(node, nq, sig, B.ro);
    out.fill(0, 0, np);
    const ro2 = B.ro, acc = B.act;
    acc.fill(0, 0, np);
    for (let a = 0, o = 0; a < na; a++, o += nq) {
      let any = false;
      for (let j = 0; j < nq; j++) { const x = ro[j] * sig[o + j]; ro2[j] = x; if (x !== 0) any = true; }
      if (!any) continue;
      const v = this.walk(node.ch[a], p, ro2, rs, depth + 1, mode);
      for (let i = 0; i < np; i++) acc[i] += v[i];
    }
    for (let i = 0; i < np; i++) out[i] = acc[i];
    return out;
  };
  /* Note: walk() reuses the buffers of the next depth for the child's reach, so the buffers of one depth must not be
     overwritten before the child returns. ro/rs passed to a child live in the parent's B.ro/B.rs, and the child writes
     only into its own depth. A decision node of player p reuses B.rs for each action in turn, which is safe because the
     child only reads it before recursing deeper. */
  Solver.prototype.iterate = function (k) {
    const g = this.g;
    for (let it = 0; it < (k || 1); it++) {
      this.t++;
      for (let p = 0; p < 2; p++) {
        const ro = new Float64Array(g.W[1 - p]), rs = new Float64Array(g.W[p]);
        this.walk(g.root, p, ro, rs, 0, 0);
      }
    }
  };
  /* ---- partitioned solving ----
     Coordinator: game built with { topOnly: true }. Workers: games built with { own: cards } and solver.partial = true.
     One traversal for player p in mode m (0 update, 1 best response, 2 value):
       1. coordinator.collectTop(p, m) returns the reach at every first-level chance node;
       2. every worker returns worker.chancePartials(p, m, reaches): per chance node, the sum over its cards of the
          child values (dead hands zeroed);
       3. coordinator.finishTop(p, m, sums) divides by K and walks the top tree with these values, updating its nodes. */
  Solver.prototype.collectTop = function (p, mode, start, ro0, rs0) {
    const g = this.g; this.collect = new Array(g.top.length).fill(null);
    const nmax = Math.max(g.n[0], g.n[1]);
    const ro = new Float64Array(nmax), rs = new Float64Array(nmax);
    ro.set(ro0 || g.W[1 - p]); rs.set(rs0 || g.W[p]);
    this.walk(start || g.root, p, ro, rs, 0, mode === 0 ? 3 : 4);
    const out = this.collect; this.collect = null; return out;
  };
  Solver.prototype.chancePartials = function (p, mode, reaches) {
    const g = this.g; this.partial = true;
    const nmax = Math.max(g.n[0], g.n[1]);
    const res = g.top.map((nd, k) => {
      const r = reaches[k]; if (!r) return null;
      const ro = new Float64Array(nmax), rs = new Float64Array(nmax);
      ro.set(r.ro); rs.set(r.rs);
      return Float64Array.from(this.walk(nd, p, ro, rs, 0, mode).subarray(0, g.n[p]));
    });
    this.partial = false; return res;
  };
  Solver.prototype.finishTop = function (p, mode, sums, start, ro0, rs0) {
    const g = this.g; this.ext = g.top.map((nd, k) => { const v = new Float64Array(g.n[p]); if (sums[k]) for (let i = 0; i < g.n[p]; i++) v[i] = sums[k][i] / nd.K; return v; });
    const nmax = Math.max(g.n[0], g.n[1]);
    const ro = new Float64Array(nmax), rs = new Float64Array(nmax);
    ro.set(ro0 || g.W[1 - p]); rs.set(rs0 || g.W[p]);
    const v = Float64Array.from(this.walk(start || g.root, p, ro, rs, 0, mode).subarray(0, g.n[p]));
    this.ext = null; return v;
  };
  /* values per deal, in chips, for both players; and exploitability */
  Solver.prototype.evaluate = function () {
    const g = this.g, res = { br: [0, 0], val: [0, 0] };
    for (let p = 0; p < 2; p++) {
      const ro = new Float64Array(g.W[1 - p]), rs = new Float64Array(g.W[p]);
      let v = this.walk(g.root, p, ro, rs, 0, 1); let s = 0; for (let i = 0; i < g.n[p]; i++) s += g.W[p][i] * v[i]; res.br[p] = s / g.Z;
      v = this.walk(g.root, p, ro, rs, 0, 2); s = 0; for (let i = 0; i < g.n[p]; i++) s += g.W[p][i] * v[i]; res.val[p] = s / g.Z;
    }
    res.expl = ((res.br[0] - res.val[0]) + (res.br[1] - res.val[1])) / 2;
    res.exploitPct = 100 * res.expl / g.pot;
    return res;
  };

  // ------------------------------------------------------------------ queries for the interface
  /* A path is a list of steps from the root: an action index at a decision node, or a card at a chance node. */
  function nodeAt(g, path, start) { let nd = start || g.root; for (const s of path) { nd = nd.t === 'c' ? nd.ch[s] : nd.ch[s]; if (!nd) return null; } return nd; }
  /* reach vectors of both players at the end of path (average strategy), with dead hands zeroed */
  function reachAt(g, path, start, r0) {
    const r = r0 ? [Float64Array.from(r0[0]), Float64Array.from(r0[1])] : [new Float64Array(g.W[0]), new Float64Array(g.W[1])]; let nd = start || g.root;
    const sig = new Float64Array(Math.max(g.n[0], g.n[1]) * 16);
    for (const s of path) {
      if (nd.t === 'c') { for (let p = 0; p < 2; p++) for (const i of g.withCard[p][s]) r[p][i] = 0; nd = nd.ch[s]; continue; }
      if (nd.t !== 'd') break;
      const p = nd.p, n = g.n[p]; averageStrategy(nd, n, sig);
      for (let i = 0; i < n; i++) r[p][i] *= sig[s * n + i];
      nd = nd.ch[s];
    }
    return r;
  }
  /* Full analysis of the node at path: strategy, reach, EV per hand, equity per hand, action frequencies. */
  Solver.prototype.analyse = function (path) { const g = this.g; return analyseNode(g, this, nodeAt(g, path), reachAt(g, path)); };
  /* Analysis of node nd, given both players' reach vectors at nd. Returns plain data (no node objects), so that it can
     be posted from a worker: strategy (hand-major), action frequencies, EV and equity per hand. */
  function analyseNode(g, solver, nd, reach) {
    const out = { type: nd.t, reach, p: nd.p, acts: nd.acts, c: nd.c, board: nd.board, pot: g.pot + (nd.c ? nd.c[0] + nd.c[1] : 0) };
    if (nd.t === 'c') out.cards = nd.all || nd.cards;
    // EV per hand for both players: counterfactual value of the average profile from this node / compatible weight
    out.ev = [0, 1].map(p => {
      const nmax = Math.max(g.n[0], g.n[1]); const ro = new Float64Array(nmax), rs = new Float64Array(nmax); ro.set(reach[1 - p]); rs.set(reach[p]);
      if (solver.ext === undefined) solver.ext = null;
      const v = Float64Array.from(solver.walk(nd, p, ro, rs, 0, 2).subarray(0, g.n[p]));
      const m = new Float64Array(g.n[p]); foldMass(g, p, reach[1 - p], m, null);
      const ev = new Float64Array(g.n[p]); const inv = nd.c ? (g.pot / 2 + nd.c[p]) : 0;
      for (let i = 0; i < g.n[p]; i++) ev[i] = m[i] > 1e-12 ? v[i] / m[i] + inv : NaN;   // chips won from here, counting own money in the pot
      return { mass: m, ev };
    });
    out.equity = [0, 1].map(p => equityAt(g, nd.board || g.board, p, reach[1 - p]));
    delete out.node;
    if (nd.t === 'd') {
      const n = g.n[nd.p], am = new Float64Array(n * nd.na); averageStrategy(nd, n, am); const sig = handMajor(nd, n, am); out.strategy = sig;
      // action frequencies over the deals reaching here
      const p = nd.p, m = out.ev[p].mass; let tot = 0; const fr = new Float64Array(nd.na);
      for (let i = 0; i < n; i++) { const w = reach[p][i] * m[i]; tot += w; for (let a = 0; a < nd.na; a++) fr[a] += w * sig[i * nd.na + a]; }
      out.freq = Array.from(fr, x => tot > 0 ? x / tot : 0);
    }
    return out;
  };
  /* equity of each of player p's hands against the opponent reach, averaged over all runouts of the board */
  function equityAt(g, board, p, ropp) {
    const n = g.n[p], acc = new Float64Array(n), cnt = new Float64Array(n);
    const used = new Uint8Array(52); for (const c of board) used[c] = 1;
    const runs = [];
    if (board.length === 5) runs.push(board.slice());
    else if (board.length === 4) { for (let c = 0; c < 52; c++) if (!used[c]) runs.push(board.concat([c])); }
    else for (let c = 0; c < 52; c++) if (!used[c]) for (let d = c + 1; d < 52; d++) if (!used[d]) runs.push(board.concat([c, d]));
    const fake = { pay: [{ W: 1, Lo: 0, T: 0.5 }, { W: 1, Lo: 0, T: 0.5 }] };
    const v = new Float64Array(n), mass = new Float64Array(n), ro = new Float64Array(g.n[1 - p]);
    const q = 1 - p;
    for (const rb of runs) {
      const key = boardKey(rb);
      if (!g.runouts.has(key)) g.runouts.set(key, { board: rb, data: null });
      ro.set(ropp); const bd = new Uint8Array(52); for (const c of rb) bd[c] = 1;
      for (let j = 0; j < g.n[q]; j++) if (bd[g.LA[q][j]] || bd[g.LB[q][j]]) ro[j] = 0;
      fake.key = key; showValue(g, fake, p, ro, v); foldMass(g, p, ro, mass, null);
      for (let i = 0; i < n; i++) if (!bd[g.LA[p][i]] && !bd[g.LB[p][i]]) { acc[i] += v[i]; cnt[i] += mass[i]; }
    }
    return Float64Array.from(acc, (x, i) => cnt[i] > 1e-12 ? x / cnt[i] : NaN);
  }
  /* lock node d: strategy given hand-major (entry i * na + a) */
  function lockNode(g, d, strat) { d.lock = actionMajor(d, g.n[d.p], strat); }
  function unlockNode(g, d) { d.lock = null; }

  const api = { RANKS, SUITS, STREETS, cardOf, cardStr, evalCards, categoryOf, classOf, className, parseRange, rangeToString,
    COMBO_A, COMBO_B, COMBO_ID, COMBO_CLASS, CLASS_COMBOS, DEFAULT_TREE, buildGame, Solver, regretMatch, averageStrategy, handMajor, actionMajor,
    nodeAt, reachAt, equityAt, analyseNode, foldMass, showValue, lockNode, unlockNode, boardKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PSEngine = api;
})(typeof self !== 'undefined' ? self : this);
