/* Cost model: time per iteration against the work count W = sum over decisions of n_p |A| and the leaf counts.
   node scaling.js -> out/scaling.json */
const { E, R, x, T, cards } = require('./spots.js'), fs = require('fs');
const ranges = [E.parseRange(R.BB), E.parseRange(R.BTN)];
const cfgs = [
  ['river, 1 size', 'Ks7d2cTh4s', 100, 100, T([x(), x()], [x(), x()], [x([75]), x([75], [], 1)], 2)],
  ['river, 2 sizes, raises', 'Ks7d2cTh4s', 100, 100, T([x(), x()], [x(), x()], [x([33, 75], [100], 1), x([33, 75], [100], 1)], 3)],
  ['turn, 1 size', 'Ks7d2c5h', 12, 91, T([x(), x()], [x([75]), x([75])], [x([75]), x([75])], 2)],
  ['turn, raises and all-in', 'Ks7d2c5h', 12, 91, T([x(), x()], [x([75], [50]), x([75], [50])], [x([75], [50], 1), x([75], [50], 1)], 3)],
  ['flop, checked down later', 'Ks7d2c', 5.5, 97.5, T([x([33], [50]), x([33, 75], [50])], [x(), x()], [x(), x()], 2)],
  ['flop, 1 size per street', 'Ks7d2c', 5.5, 97.5, T([x(), x([33])], [x([75]), x([75])], [x([75]), x([75])], 2)],
  ['flop, standard', 'Ks7d2c', 5.5, 97.5, T([x([], [50]), x([33])], [x([75]), x([75])], [x([75]), x([75])], 2)],
];
const res = [];
for (const [name, b, pot, stack, tree] of cfgs) {
  const t0 = Date.now(); const g = E.buildGame({ board: cards(b), pot, stack, ranges, tree }); const tb = Date.now() - t0;
  const s = new E.Solver(g);
  let nf = 0, ns = 0, nc = 0; const seen = new Set();
  (function walk(n) { if (!n) return; if (n.t === 'f') { nf++; return; } if (n.t === 's') { ns++; return; } if (n.t === 'c') { nc++; n.cards.forEach(c => walk(n.ch[c])); return; } n.ch.forEach(walk); })(g.root);
  const work = g.decisions.reduce((a, d) => a + g.n[d.p] * d.na, 0);
  s.iterate(1); const reps = work > 3e7 ? 2 : work > 3e6 ? 5 : 40;
  const t1 = Date.now(); s.iterate(reps); const per = (Date.now() - t1) / reps;
  const r = { name, decisions: g.decisions.length, work, foldLeaves: nf, showLeaves: ns, chance: nc, n: g.n, memMB: g.memBytes / 1e6, buildMs: tb, msPerIter: per };
  res.push(r); console.log(JSON.stringify(r));
}
fs.writeFileSync(__dirname + '/out/scaling.json', JSON.stringify(res));
