/* Node locking on the talk's river: after a check, lock the button to bet a third of the pot with every hand.
   Compares the equilibrium with the solution of the locked game, and the iterations each needs for 0.3% of the pot.
   node lock.js -> out/lock.json */
const { E, SPOTS } = require('./spots.js'), fs = require('fs');
const cfg = SPOTS.river.cfg;
function run(lock, maxIt) {
  const g = E.buildGame(cfg), s = new E.Solver(g), ip = E.nodeAt(g, [0]);
  const betIdx = ip.acts.findIndex(a => a.kind === 'bet');
  if (lock) { const n = g.n[1], L = new Float64Array(n * ip.na); for (let i = 0; i < n; i++) L[i * ip.na + betIdx] = 1; E.lockNode(g, ip, L); }
  let it = null, r; const pts = [];
  for (let k = 10; k <= maxIt; k = Math.ceil(k * 1.2)) { s.iterate(k - s.t); r = s.evaluate(); pts.push([k, r.exploitPct, r.val[0]]); if (it === null && r.exploitPct <= 0.3) it = k; }
  const oop = E.nodeAt(g, [0, betIdx]);
  return { s, g, betIdx, foldIdx: oop.acts.findIndex(a => a.kind === 'fold'), it, r, pts, ip: s.analyse([0]).freq, oop: s.analyse([0, betIdx]).freq, acts: ip.acts.map(a => a.label), oopActs: oop.acts.map(a => a.label) };
}
const A = run(false, 20000), B = run(true, 20000);
const res = { base: { val: A.r.val, expl: A.r.exploitPct }, before: { ip: A.ip, oop: A.oop, acts: A.acts, oopActs: A.oopActs }, after: { ip: B.ip, oop: B.oop },
  betIdx: A.betIdx, foldIdx: A.foldIdx, itBefore: A.it, itAfter: B.it, valAfter: B.r.val[0], explAfter: B.r.exploitPct, ptsBefore: A.pts, ptsAfter: B.pts };
console.log('iterations to 0.3%: free', A.it, 'locked', B.it, '| values', A.r.val[0].toFixed(3), B.r.val[0].toFixed(3), '| final expl', A.r.exploitPct.toExponential(2), B.r.exploitPct.toExponential(2));
console.log('fold to the bet', (100 * A.oop[A.foldIdx]).toFixed(1), '->', (100 * B.oop[A.foldIdx]).toFixed(1));
fs.writeFileSync(__dirname + '/out/lock.json', JSON.stringify(res));
