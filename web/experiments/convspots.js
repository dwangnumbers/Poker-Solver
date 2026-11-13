/* DCFR on several spots per street: iterations to reach 1%, 0.3% and 0.1% of the pot.
   node convspots.js street -> out/convspots_<street>.json */
const { E, R, x, T, cards } = require('./spots.js'), fs = require('fs');
const street = process.argv[2] || 'river';
const boards = { river: ['Ks7d2cTh4s', 'Ad8d4c9s2h', 'Th9h8c3d2s', 'QsJc5d5h2c', '7c6c2dKhAs'], turn: ['Ks7d2cTh', 'Ad8d4c9s', 'Th9h8c3d', 'QsJc5d5h', '7c6c2dKh'], flop: ['Ks7d2c', 'Th9h8c', 'Ad8d4c'] }[street];
const ranges = [E.parseRange(R.BB), E.parseRange(R.BTN)];
const tree = {
  river: T([x(), x()], [x(), x()], [x([75], [50], 1), x([33, 75], [50], 1)], 3),
  turn: T([x(), x()], [x([75]), x([75], [50])], [x([75], [], 1), x([75], [], 1)], 2),
  flop: T([x(), x([33])], [x([75]), x([75])], [x([75]), x([75])], 2),
}[street];
const pot = { river: 20, turn: 12, flop: 5.5 }[street], stack = { river: 87, turn: 91, flop: 97.5 }[street];
const maxIt = { river: 3000, turn: 1500, flop: 300 }[street], tol = [1, 0.3, 0.1];
const res = [];
for (const b of boards) {
  const g = E.buildGame({ board: cards(b), pot, stack, ranges, tree }), s = new E.Solver(g), pts = [], hit = {};
  for (let k = 1; k <= maxIt; k = Math.max(k + 1, Math.ceil(k * 1.15))) {
    s.iterate(k - s.t); const e = s.evaluate().exploitPct; pts.push([k, e]);
    for (const t of tol) if (hit[t] == null && e <= t) hit[t] = k;
    if (e <= 0.1 && street === 'flop') break;
  }
  res.push({ board: b, decisions: g.decisions.length, n: g.n, pts, hit });
  console.log(street, b, 'decisions', g.decisions.length, 'iterations to 1/0.3/0.1%:', tol.map(t => hit[t] ?? '>' + maxIt).join(' / '), 'final', pts[pts.length - 1][1].toExponential(2));
  fs.writeFileSync(__dirname + `/out/convspots_${street}.json`, JSON.stringify(res));
}
