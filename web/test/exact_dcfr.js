/* The zero-reach shortcut must give exactly the iterates of plain DCFR (every subtree walked, no shortcut). */
const { E, SPOTS } = require('../experiments/spots.js');
// a small flop game with two chance levels (the game of flop_check.js), where skipping did the most damage
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const bc = ['Ks', '7d', '2c'].map(E.cardOf);
function pick(k) { const out = new Set(); while (out.size < k) { const a = Math.floor(rnd() * 52), b = Math.floor(rnd() * 52); if (a === b || bc.includes(a) || bc.includes(b)) continue; out.add(E.COMBO_ID[a * 52 + b]); } return [...out]; }
const H = [pick(6), pick(5)], ranges = H.map(l => { const r = new Float64Array(1326); for (const k of l) r[k] = 1; return r; });
SPOTS.smallflop = { cfg: { board: bc, pot: 100, stack: 1000, ranges, tree: { streets: { flop: { oop: { bet: [50] }, ip: { bet: [50] } }, turn: { oop: { bet: [100] }, ip: { bet: [100] } }, river: { oop: { bet: [] }, ip: { bet: [] } } }, maxBets: 1, allinThreshold: 2, mergeTolerance: 0 } } };
for (const key of ['river', 'turn', 'smallflop']) {
  const a = new E.Solver(E.buildGame(SPOTS[key].cfg)), b = new E.Solver(E.buildGame(SPOTS[key].cfg)); b.noSkip = true;
  let t0 = Date.now(); a.iterate(60); const ta = Date.now() - t0; t0 = Date.now(); b.iterate(60); const tb = Date.now() - t0;
  let d = 0; for (let k = 0; k < a.g.decisions.length; k++) { const x = a.g.decisions[k], y = b.g.decisions[k]; for (let i = 0; i < x.R.length; i++) d = Math.max(d, Math.abs(x.R[i] - y.R[i]), Math.abs(x.S[i] - y.S[i])); }
  console.log(key, 'max |difference| of regrets and sums', d, 'ms shortcut', ta, 'ms plain', tb);
}
