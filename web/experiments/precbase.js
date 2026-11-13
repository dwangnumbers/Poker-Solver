/* Baseline for the strategy distance of the precision slide: the same reach-weighted L1 distance between two float64
   iterates of one run, at T/1.1 and T. node precbase.js -> out/precbase.json */
const { E, SPOTS } = require('./spots.js'), fs = require('fs');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const bc = ['Ks', '7d', '2c', 'Th'].map(E.cardOf);
function pick(k) { const out = new Set(); while (out.size < k) { const a = Math.floor(rnd() * 52), b = Math.floor(rnd() * 52); if (a === b || bc.includes(a) || bc.includes(b)) continue; out.add(E.COMBO_ID[a * 52 + b]); } return [...out]; }
const H = [pick(14), pick(12)], ranges = H.map(l => { const r = new Float64Array(1326); for (const k of l) r[k] = 1; return r; });
const small = { board: bc, pot: 100, stack: 1000, ranges, tree: { streets: { flop: { oop: { bet: [] }, ip: { bet: [] } }, turn: { oop: { bet: [50] }, ip: { bet: [50] } }, river: { oop: { bet: [100] }, ip: { bet: [100] } } }, maxBets: 1, allinThreshold: 2, mergeTolerance: 0 } };
function snap(s) { return s.g.decisions.map(d => { const n = s.g.n[d.p], a = new Float64Array(n * d.na); E.averageStrategy(d, n, a); return { a, w: Float64Array.from({ length: n }, (_, i) => { let w = 0; for (let q = 0; q < d.na; q++) w += d.S[q * n + i]; return w; }) }; }); }
function dist(A, B) { let num = 0, den = 0; A.forEach((x, k) => { const y = B[k], n = x.w.length, na = x.a.length / n; for (let i = 0; i < n; i++) { let d = 0; for (let q = 0; q < na; q++) d += Math.abs(x.a[q * n + i] - y.a[q * n + i]); num += y.w[i] * d; den += y.w[i]; } }); return num / den; }
const out = {};
for (const [name, cfg, T] of [['small turn game', small, 30000], ['turn spot', SPOTS.turn.cfg, 1500]]) {
  const s = new E.Solver(E.buildGame(cfg), { precision: 64 });
  s.iterate(Math.round(T / 1.1)); const A = snap(s); s.iterate(T - s.t); const B = snap(s);
  out[name] = dist(A, B); console.log(name, 'distance between float64 iterates at T/1.1 and T', out[name].toExponential(2));
}
fs.writeFileSync(__dirname + '/out/precbase.json', JSON.stringify(out));
