/* Distance between two double precision DCFR runs whose ranges differ by 1e-7, against the iteration count, with the
   exploitability: how well the solution determines the strategy (conditioning). node perturbT.js -> out/perturbT.json */
const { E, SPOTS } = require('./spots.js'), fs = require('fs');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const bc = ['Ks', '7d', '2c', 'Th'].map(E.cardOf);
function pick(k) { const out = new Set(); while (out.size < k) { const a = Math.floor(rnd() * 52), b = Math.floor(rnd() * 52); if (a === b || bc.includes(a) || bc.includes(b)) continue; out.add(E.COMBO_ID[a * 52 + b]); } return [...out]; }
const H = [pick(14), pick(12)], ranges = H.map(l => { const r = new Float64Array(1326); for (const k of l) r[k] = 1; return r; });
const small = { board: bc, pot: 100, stack: 1000, ranges, tree: { streets: { flop: { oop: { bet: [] }, ip: { bet: [] } }, turn: { oop: { bet: [50] }, ip: { bet: [50] } }, river: { oop: { bet: [100] }, ip: { bet: [100] } } }, maxBets: 1, allinThreshold: 2, mergeTolerance: 0 } };
function dist(a, b) { let num = 0, den = 0; a.g.decisions.forEach((x, k) => { const y = b.g.decisions[k], n = a.g.n[x.p], na = x.na; const sx = new Float64Array(n * na), sy = new Float64Array(n * na); E.averageStrategy(x, n, sx); E.averageStrategy(y, n, sy); for (let i = 0; i < n; i++) { let w = 0; for (let q = 0; q < na; q++) w += y.S[q * n + i]; let d = 0; for (let q = 0; q < na; q++) d += Math.abs(sx[q * n + i] - sy[q * n + i]); num += w * d; den += w; } }); return num / den; }
let s2 = 99; const r2 = () => (s2 = (s2 * 1103515245 + 12345) % 2147483648) / 2147483648;
const out = {};
for (const [name, cfg, Ts] of [['small turn game', small, [100, 300, 1000, 3000, 10000, 30000]], ['turn spot', SPOTS.turn.cfg, [30, 100, 300, 1000]]]) {
  const pr = cfg.ranges.map(r => Float64Array.from(r, x => x * (1 + 1e-7 * (2 * r2() - 1))));
  const a = new E.Solver(E.buildGame(cfg), { precision: 64 }), b = new E.Solver(E.buildGame(Object.assign({}, cfg, { ranges: pr })), { precision: 64 });
  out[name] = [];
  for (const T of Ts) { a.iterate(T - a.t); b.iterate(T - b.t); const e = a.evaluate().exploitPct, d = dist(a, b); out[name].push({ T, expl: e, dist: d }); console.log(name, T, 'expl %', e.toExponential(2), 'distance', d.toExponential(2)); }
}
fs.writeFileSync(__dirname + '/out/perturbT.json', JSON.stringify(out));
