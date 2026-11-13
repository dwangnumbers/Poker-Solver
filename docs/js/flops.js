/* The 1,755 flops that differ up to a permutation of suits, their multiplicities, and stratified weighted subsets. */
(function (root) {
  'use strict';
  const isNode = typeof window === 'undefined' && typeof importScripts === 'undefined';
  const E = isNode ? require('./engine.js') : root.PSEngine;
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
  const api = { allFlops, subset, canonical, group, PERMS };
  if (isNode && typeof module !== 'undefined') module.exports = api; else root.PSFlops = api;
})(typeof self !== 'undefined' ? self : this);
