/* Storage precision of regrets (R) and strategy sums (S): all four combinations of float32 and float64.
   node precision.js -> out/precision.json */
const { E, SPOTS } = require('./spots.js'), fs = require('fs');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const bc = ['Ks', '7d', '2c', 'Th'].map(E.cardOf);
function pick(k) { const out = new Set(); while (out.size < k) { const a = Math.floor(rnd() * 52), b = Math.floor(rnd() * 52); if (a === b || bc.includes(a) || bc.includes(b)) continue; out.add(E.COMBO_ID[a * 52 + b]); } return [...out]; }
const H = [pick(14), pick(12)], ranges = H.map(l => { const r = new Float64Array(1326); for (const k of l) r[k] = 1; return r; });
const small = { board: bc, pot: 100, stack: 1000, ranges, tree: { streets: { flop: { oop: { bet: [] }, ip: { bet: [] } }, turn: { oop: { bet: [50] }, ip: { bet: [50] } }, river: { oop: { bet: [100] }, ip: { bet: [100] } } }, maxBets: 1, allinThreshold: 2, mergeTolerance: 0 } };
const CONF = { 'R32 S32': [32, 32], 'R64 S64': [64, 64], 'R32 S64': [32, 64], 'R64 S32': [64, 32] };
const out = {};
for (const [name, cfg, maxIt] of [['small turn game', small, 30000], ['turn spot', SPOTS.turn.cfg, 1500]]) {
  out[name] = {}; const sol = {};
  for (const [c, [pr, ps]] of Object.entries(CONF)) {
    const s = new E.Solver(E.buildGame(cfg), { precisionR: pr, precisionS: ps }), pts = [];
    for (let k = 1; k <= maxIt; k = Math.ceil(k * 1.3)) { s.iterate(k - s.t); pts.push([k, s.evaluate().exploitPct]); }
    s.iterate(maxIt - s.t); pts.push([maxIt, s.evaluate().exploitPct]);
    out[name][c] = pts; sol[c] = s;
    console.log(name, c, pts.slice(-2).map(p => p[0] + ':' + p[1].toExponential(3)).join(' '));
  }
  // reach-weighted difference of the average strategies, float32 against float64 storage:
  // sum over nodes and hands of own reach times the L1 distance of the action distributions, over the total reach
  const a = sol['R32 S32'], b = sol['R64 S64'], ra = E.reachAt;
  let num = 0, den = 0;
  for (let k = 0; k < a.g.decisions.length; k++) {
    const x = a.g.decisions[k], y = b.g.decisions[k], n = a.g.n[x.p];
    const sx = new Float64Array(n * x.na), sy = new Float64Array(n * x.na); E.averageStrategy(x, n, sx); E.averageStrategy(y, n, sy);
    for (let i = 0; i < n; i++) { let w = 0; for (let q = 0; q < x.na; q++) w += y.S[q * n + i]; let d = 0; for (let q = 0; q < x.na; q++) d += Math.abs(sx[q * n + i] - sy[q * n + i]); num += w * d; den += w; }
  }
  out[name].weightedStrategyDiff = num / den; console.log(name, 'reach-weighted L1 strategy difference', (num / den).toExponential(2));
}
fs.writeFileSync(__dirname + '/out/precision.json', JSON.stringify(out));
