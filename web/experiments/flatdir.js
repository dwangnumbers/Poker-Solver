/* Test of the flat-direction explanation of the precision result: split the reach-weighted L1 distance between the
   float32 and float64 strategies into hands with a clear preference (the best action value exceeds the second best by
   more than a relative tolerance) and hands that are nearly indifferent. node flatdir.js -> out/flatdir.json */
const { E, SPOTS } = require('./spots.js'), fs = require('fs');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const bc = ['Ks', '7d', '2c', 'Th'].map(E.cardOf);
function pick(k) { const out = new Set(); while (out.size < k) { const a = Math.floor(rnd() * 52), b = Math.floor(rnd() * 52); if (a === b || bc.includes(a) || bc.includes(b)) continue; out.add(E.COMBO_ID[a * 52 + b]); } return [...out]; }
const H = [pick(14), pick(12)], ranges = H.map(l => { const r = new Float64Array(1326); for (const k of l) r[k] = 1; return r; });
const small = { board: bc, pot: 100, stack: 1000, ranges, tree: { streets: { flop: { oop: { bet: [] }, ip: { bet: [] } }, turn: { oop: { bet: [50] }, ip: { bet: [50] } }, river: { oop: { bet: [100] }, ip: { bet: [100] } } }, maxBets: 1, allinThreshold: 2, mergeTolerance: 0 } };
const out = {};
for (const [name, cfg, T] of [['small turn game', small, 30000], ['turn spot', SPOTS.turn.cfg, 1500]]) {
  const a = new E.Solver(E.buildGame(cfg), { precision: 32 }), b = new E.Solver(E.buildGame(cfg), { precision: 64 });
  a.iterate(T); b.iterate(T);
  // action values of the double precision average profile, recorded in a value traversal for each player
  b.rec = new Map(); const g = b.g, nmax = Math.max(g.n[0], g.n[1]);
  for (let p = 0; p < 2; p++) { const ro = new Float64Array(nmax), rs = new Float64Array(nmax); ro.set(g.W[1 - p]); rs.set(g.W[p]); b.walk(g.root, p, ro, rs, 0, 2); }
  const res = {};
  for (const tol of [1e-2, 1e-3, 1e-4]) {
    let numC = 0, denC = 0, numI = 0, denI = 0;
    a.g.decisions.forEach((x, k) => {
      const y = g.decisions[k], n = g.n[y.p], na = y.na, v = b.rec.get(y); if (!v) return;
      const sx = new Float64Array(n * na), sy = new Float64Array(n * na); E.averageStrategy(x, n, sx); E.averageStrategy(y, n, sy);
      for (let i = 0; i < n; i++) {
        let w = 0; for (let q = 0; q < na; q++) w += y.S[q * n + i];
        let m1 = -Infinity, m2 = -Infinity, sc = 0; for (let q = 0; q < na; q++) { const z = v[q * n + i]; sc = Math.max(sc, Math.abs(z)); if (z > m1) { m2 = m1; m1 = z; } else if (z > m2) m2 = z; }
        let d = 0; for (let q = 0; q < na; q++) d += Math.abs(sx[q * n + i] - sy[q * n + i]);
        if (sc > 0 && m1 - m2 > tol * sc) { numC += w * d; denC += w; } else { numI += w * d; denI += w; }
      }
    });
    res[tol] = { clear: numC / denC, indifferent: numI / denI, clearShare: denC / (denC + denI) };
    console.log(name, 'tol', tol, 'distance on clear-preference hands', (numC / denC).toExponential(2), 'on near-indifferent hands', (numI / denI).toExponential(2), 'share of weight with a clear preference', (denC / (denC + denI)).toFixed(3));
  }
  out[name] = res;
}
fs.writeFileSync(__dirname + '/out/flatdir.json', JSON.stringify(out));
