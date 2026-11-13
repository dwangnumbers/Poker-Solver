const E = require('../js/engine.js');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const bc = ['Ks','7d','2c','Th'].map(E.cardOf);
function pick(k) { const out = new Set(); while (out.size < k) { const a = Math.floor(rnd() * 52), b = Math.floor(rnd() * 52); if (a === b || bc.includes(a) || bc.includes(b)) continue; out.add(E.COMBO_ID[a * 52 + b]); } return [...out]; }
const H = [pick(14), pick(12)];
const ranges = H.map(l => { const r = new Float64Array(1326); for (const k of l) r[k] = 1; return r; });
const tree = { streets: { flop: { oop: { bet: [] }, ip: { bet: [] } }, turn: { oop: { bet: [50] }, ip: { bet: [50] } }, river: { oop: { bet: [100] }, ip: { bet: [100] } } }, maxBets: 1, allinThreshold: 2, mergeTolerance: 0 };
for (const prec of [32, 64]) for (const [a,b,gm] of [[1.5,0,2],[1.5,0.5,2],[1.5,-1e9,2]]) {
  const g = E.buildGame({ board: bc, pot: 100, stack: 1000, ranges, tree }); const s = new E.Solver(g, { precision: prec, alpha:a, beta:b, gamma:gm });
  const out = []; for (const T of [200, 2000, 20000]) { s.iterate(T - s.t); out.push(s.evaluate().expl.toExponential(2)); }
  console.log('f' + prec, 'alpha,beta,gamma', a, b, gm, out.join(' '));
}
