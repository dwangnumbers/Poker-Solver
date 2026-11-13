/* Aggregate report estimates from the stratified subsets (25, 49, 95, 184 flops) and all 1,755 flops, on the
   checked-down tree. node reportsub.js [sizes] -> out/reportsub.json */
const { E, R, x, T } = require('./spots.js'), fs = require('fs');
const { allFlops, subset } = require('../js/flops.js');
const FL = allFlops();
const tree = T([x([33], [50]), x([33, 75], [50])], [x(), x()], [x(), x()], 2), ranges = [E.parseRange(R.BB), E.parseRange(R.BTN)];
const cache = new Map();
function solveFlop(f) {
  if (cache.has(f.label)) return cache.get(f.label);
  const g = E.buildGame({ board: f.cards, pot: 5.5, stack: 97.5, ranges, tree }), s = new E.Solver(g);
  let r; for (let it = 0; it < 200; it += 10) { s.iterate(10); r = s.evaluate(); if (r.exploitPct < 0.3) break; }
  const root = s.analyse([]), ci = root.acts.findIndex(a => a.kind === 'check');
  const out = { val0: r.val[0], expl: r.exploitPct, oopBet: 1 - root.freq[ci], it: s.t };
  cache.set(f.label, out); return out;
}
const sizes = (process.argv[2] || '25,49,95,184').split(',').map(Number), res = { rows: [] };
for (const n of sizes) {
  const sub = subset(FL, n); let W = 0, v = 0, b = 0; const t0 = Date.now(), flops = [];
  for (const f of sub) { const r = solveFlop(f); W += f.w; v += f.w * r.val0; b += f.w * r.oopBet; flops.push({ label: f.label, w: f.w, group: require('../js/flops.js').group(f), val0: r.val0, oopBet: r.oopBet, expl: r.expl }); }
  res.rows.push({ n: sub.length, oopValue: v / W, oopBetFreq: b / W, seconds: (Date.now() - t0) / 1000, flops });
  console.log(JSON.stringify(res.rows[res.rows.length - 1]));
  fs.writeFileSync(__dirname + '/out/reportsub.json', JSON.stringify(res));
}
