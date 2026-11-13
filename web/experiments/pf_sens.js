/* Sensitivity of the heads-up push-or-fold solution to the Monte Carlo error of the equity table: solve with two
   independent tables (data/eq2.f32 and data/eq2_b.f32) and compare. node pf_sens.js -> out/pf_sens.json */
const P = require('../js/preflop.js'), fs = require('fs'), path = require('path');
const rd = (n, T) => { const b = fs.readFileSync(path.join(__dirname, '..', 'data', n)); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const c2 = rd('c2.u16', Uint16Array), A = rd('eq2.f32', Float32Array), B = rd('eq2_b.f32', Float32Array);
let md = 0, s2 = 0; for (let i = 0; i < A.length; i++) { const d = A[i] - B[i]; md = Math.max(md, Math.abs(d)); s2 += d * d; }
const res = { maxTableDiff: md, rmsTableDiff: Math.sqrt(s2 / A.length), rows: [] };
for (const stack of [5, 10, 15, 20]) {
  const out = [], sol = [];
  for (const eq2 of [A, B]) {
    const tab = P.prepare({ c2, eq2 }), tree = P.buildTree({ players: 2, stack, maxRaises: 1, allinThreshold: 0, sbLimp: false }), s = new P.Solver(tree, tab);
    s.iterate(3000); const r = s.evaluate(), root = s.analyse([]);
    let push = 0; for (let k = 0; k < 169; k++) push += P.CNT[k] * root.strategy[169 + k];
    out.push({ val: r.val[0], push: push / 1326, expl: r.expl }); sol.push(s);
  }
  // cross-exploitability: the equilibrium computed with table A, evaluated in the game with table B
  const sB = sol[1]; sol[0].tree.decisions.forEach((d, k) => { sB.tree.decisions[k].S.set(d.S); });
  const cross = sB.evaluate();
  res.rows.push({ stack, valA: out[0].val, valB: out[1].val, pushA: out[0].push, pushB: out[1].push, explA: out[0].expl, explB: out[1].expl, crossExpl: cross.expl });
  console.log(stack, JSON.stringify(res.rows[res.rows.length - 1]));
}
console.log('table difference: max', md.toExponential(2), 'rms', res.rmsTableDiff.toExponential(2));
fs.writeFileSync(__dirname + '/out/pf_sens.json', JSON.stringify(res));
