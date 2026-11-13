/* Time and evaluated work of every iteration over a solve, for the cost model: each iteration is timed together with
   the work counted by the instrumented engine in that same iteration. node costpairs.js -> out/costpairs.json */
const { E, R, x, T, cards } = require('./spots.js'), fs = require('fs');
const ranges = [E.parseRange(R.BB), E.parseRange(R.BTN)];
const cfgs = [
  ['turn, 1 size', 'Ks7d2c5h', 12, 91, T([x(), x()], [x([75]), x([75])], [x([75]), x([75])], 2), 60],
  ['turn, raises and all-in', 'Ks7d2c5h', 12, 91, T([x(), x()], [x([75], [50]), x([75], [50])], [x([75], [50], 1), x([75], [50], 1)], 3), 40],
  ['turn, river checked down', 'Ks7d2c5h', 12, 91, T([x(), x()], [x([50, 100], [50]), x([50, 100], [50])], [x(), x()], 2), 60],
  ['turn, two sizes', 'Ks7d2c5h', 12, 91, T([x(), x()], [x([50, 100]), x([50, 100], [50])], [x([75], [], 1), x([75], [], 1)], 2), 40],
  ['flop, checked down later', 'Ks7d2c', 5.5, 97.5, T([x([33], [50]), x([33, 75], [50])], [x(), x()], [x(), x()], 2), 20],
  ['flop, river checked down', 'Ks7d2c', 5.5, 97.5, T([x([33]), x([33, 75])], [x([75]), x([75])], [x(), x()], 2), 20],
  ['flop, 1 size per street', 'Ks7d2c', 5.5, 97.5, T([x(), x([33])], [x([75]), x([75])], [x([75]), x([75])], 2), 14],
  ['flop, standard', 'Ks7d2c', 5.5, 97.5, T([x([], [50]), x([33])], [x([75]), x([75])], [x([75]), x([75])], 2), 14],
];
const out = [];
for (const [name, b, pot, stack, tree, iters] of cfgs) {
  const g = E.buildGame({ board: cards(b), pot, stack, ranges, tree }), s = new E.Solver(g);
  const work = g.decisions.reduce((a, d) => a + g.n[d.p] * d.na, 0), rows = [];
  for (let it = 0; it < iters; it++) {
    s.count = { fold: 0, show: 0, chance: 0, own: 0, opp: 0 };
    const t0 = process.hrtime.bigint(); s.iterate(1); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    rows.push({ it: s.t, ms, show: s.count.show, fold: s.count.fold, chance: s.count.chance });
  }
  s.count = null;
  out.push({ name, decisions: g.decisions.length, work, rows });
  const ms = rows.map(r => r.ms); console.log(name, 'ms first/median/last', ms[0].toFixed(0), ms.slice().sort((a, b) => a - b)[ms.length >> 1].toFixed(0), ms[ms.length - 1].toFixed(0));
}
fs.writeFileSync(__dirname + '/out/costpairs.json', JSON.stringify(out));
