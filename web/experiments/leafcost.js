/* Cost of one showdown and one fold evaluation: the O(n) sweep and inclusion-exclusion against the direct O(n^2) sum.
   node leafcost.js -> out/leafcost.json */
const { E } = require('./spots.js'), fs = require('fs');
const board = 'Ks7d2cTh4s'.match(/../g).map(E.cardOf);
const all = '22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,82s+,72s+,62s+,52s+,42s+,32s,A2o+,K2o+,Q2o+,J2o+,T2o+,92o+,82o+,72o+,62o+,52o+,42o+,32o';
const res = [];
function rangeOfSize(m) {   // the first m combos of a full range in a fixed random order
  const w = new Float64Array(1326), ids = []; for (let k = 0; k < 1326; k++) ids.push(k);
  let s = 7; for (let i = ids.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  let c = 0; for (const k of ids) { if (board.includes(E.COMBO_A[k]) || board.includes(E.COMBO_B[k])) continue; w[k] = 1; if (++c >= m) break; } return w;
}
for (const m of [50, 100, 200, 400, 700, 1081]) {
  const w = rangeOfSize(m);
  const g = E.buildGame({ board, pot: 10, stack: 10, ranges: [w, w], tree: { streets: { river: { oop: { bet: [] }, ip: { bet: [] } } }, maxBets: 1 } });
  const leaf = (function find(n) { if (n.t === 's') return n; if (n.ch) for (const c of n.ch) { if (c) { const f = find(c); if (f) return f; } } return null; })(g.root);
  const n = g.n[0], ro = new Float64Array(n); for (let j = 0; j < n; j++) ro[j] = 0.2 + 0.8 * ((j * 7919) % 101) / 101;
  const out = new Float64Array(n), out2 = new Float64Array(n);
  E.showValue(g, leaf, 0, ro, out);               // builds the sorted runout data once
  const reps = Math.max(20, Math.round(2e6 / n));
  let t0 = process.hrtime.bigint(); for (let r = 0; r < reps; r++) E.showValue(g, leaf, 0, ro, out); const tSweep = Number(process.hrtime.bigint() - t0) / reps / 1e3;
  t0 = process.hrtime.bigint(); for (let r = 0; r < reps; r++) E.foldMass(g, 0, ro, out2, null); const tFold = Number(process.hrtime.bigint() - t0) / reps / 1e3;
  // direct sum over pairs
  const c7 = new Int8Array(7); for (let i = 0; i < 5; i++) c7[i] = board[i];
  const str = Int32Array.from({ length: n }, (_, i) => { c7[5] = g.LA[0][i]; c7[6] = g.LB[0][i]; return E.evalCards(c7, 7); });
  const pay = leaf.pay[0], direct = new Float64Array(n);
  const reps2 = Math.max(3, Math.round(2e5 / (n * n) * 50));
  t0 = process.hrtime.bigint();
  for (let r = 0; r < reps2; r++) for (let i = 0; i < n; i++) {
    const a = g.LA[0][i], b = g.LB[0][i]; let s = 0;
    for (let j = 0; j < n; j++) { const c = g.LA[1][j], d = g.LB[1][j]; if (c === a || c === b || d === a || d === b) continue; const x = ro[j]; s += x * (str[i] > str[j] ? pay.W : str[i] < str[j] ? pay.Lo : pay.T); }
    direct[i] = s;
  }
  const tDirect = Number(process.hrtime.bigint() - t0) / reps2 / 1e3;
  let err = 0; for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(direct[i] - out[i]) / (1 + Math.abs(direct[i])));
  res.push({ n, sweep_us: tSweep, fold_us: tFold, direct_us: tDirect, maxRelErr: err });
  console.log(n, 'sweep', tSweep.toFixed(2), 'us  fold', tFold.toFixed(2), 'us  direct', tDirect.toFixed(1), 'us  err', err.toExponential(1));
}
fs.writeFileSync(__dirname + '/out/leafcost.json', JSON.stringify(res));
