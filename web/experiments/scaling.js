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
  ['river, 3 sizes, raises', 'Ks7d2cTh4s', 20, 87, T([x(), x()], [x(), x()], [x([33, 75, 150], [50], 1), x([33, 75, 150], [50], 1)], 3)],
  ['turn, river checked down', 'Ks7d2c5h', 12, 91, T([x(), x()], [x([50, 100], [50]), x([50, 100], [50])], [x(), x()], 2)],
  ['turn, two sizes', 'Ks7d2c5h', 12, 91, T([x(), x()], [x([50, 100]), x([50, 100], [50])], [x([75], [], 1), x([75], [], 1)], 2)],
  ['flop, river checked down', 'Ks7d2c', 5.5, 97.5, T([x([33]), x([33, 75])], [x([75]), x([75])], [x(), x()], 2)],
];
const res = [];
for (const [name, b, pot, stack, tree] of cfgs) {
  const t0 = Date.now(); const g = E.buildGame({ board: cards(b), pot, stack, ranges, tree }); const tb = Date.now() - t0;
  const s = new E.Solver(g);
  let nf = 0, ns = 0, nc = 0; const seen = new Set();
  (function walk(n) { if (!n) return; if (n.t === 'f') { nf++; return; } if (n.t === 's') { ns++; return; } if (n.t === 'c') { nc++; n.cards.forEach(c => walk(n.ch[c])); return; } n.ch.forEach(walk); })(g.root);
  const work = g.decisions.reduce((a, d) => a + g.n[d.p] * d.na, 0);
  // leaf and chance work in hand units: each traversal evaluates every leaf for the traversing player
  const nn = (g.n[0] + g.n[1]) / 2; let wf = 0, ws = 0, wc = 0;
  (function walk(n) { if (!n) return; if (n.t === 'f') { wf += nn; return; } if (n.t === 's') { ws += nn; return; } if (n.t === 'c') { wc += nn * n.cards.length; n.cards.forEach(c => walk(n.ch[c])); return; } n.ch.forEach(walk); })(g.root);
  s.iterate(1); const reps = work > 3e7 ? 4 : work > 3e6 ? 10 : 40;
  // three timed blocks of reps iterations; the median block is reported and the spread is kept
  const blocks = []; for (let k = 0; k < 3; k++) { const t1 = Date.now(); s.iterate(reps); blocks.push((Date.now() - t1) / reps); }
  const per = blocks.slice().sort((x, y) => x - y)[1];
  // leaves and chance children actually evaluated (subtrees with zero opponent reach skip their leaves), per iteration
  s.count = { fold: 0, show: 0, chance: 0, own: 0, opp: 0 }; s.iterate(2); const ev = { fold: s.count.fold / 2, show: s.count.show / 2, chance: s.count.chance / 2, own: s.count.own / 2, opp: s.count.opp / 2 }; s.count = null;
  const r = { name, decisions: g.decisions.length, work, foldWork: wf, showWork: ws, chanceWork: wc, evFold: ev.fold, evShow: ev.show, evChance: ev.chance, evOwn: ev.own, evOpp: ev.opp, foldLeaves: nf, showLeaves: ns, chance: nc, n: g.n, memMB: g.memBytes / 1e6, buildMs: tb, msPerIter: per, blocks };
  res.push(r); console.log(JSON.stringify(r));
}
fs.writeFileSync(__dirname + '/out/scaling.json', JSON.stringify(res));
