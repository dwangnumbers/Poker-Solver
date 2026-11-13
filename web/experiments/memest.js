/* Memory of flop trees on K72 (big blind against button), by the estimator of the postflop page: the top of the tree
   plus one card's subtree times the number of cards. node memest.js -> out/memest.json */
const { E, R, x, T, cards } = require('./spots.js'), fs = require('fs');
const ranges = [E.parseRange(R.BB), E.parseRange(R.BTN)];
const trees = [
  ['-- / 33', '75 / 75', '75 / 75', T([x(), x([33])], [x([75]), x([75])], [x([75]), x([75])], 2)],
  ['cr 50 / 33', '75 / 75', '75 / 75', T([x([], [50]), x([33])], [x([75]), x([75])], [x([75]), x([75])], 2)],
  ['cr 50 / 33', '-- / 75', '75 / 75, ai', T([x([], [50]), x([33])], [x(), x([75])], [x([75]), x([75], [], 1)], 2)],
  ['cr 50 / 33', '66 / 66, r 50', '75 / 75, ai', T([x([], [50]), x([33])], [x([66]), x([66], [50])], [x([75]), x([75], [], 1)], 2)],
  ['cr 50 / 33, 75', '-- / 75, r 50', '75 / 75, ai', T([x([], [50]), x([33, 75])], [x(), x([75], [50])], [x([75], [], 1), x([75], [], 1)], 2)],
  ['cr 60 / 33', '75 / 75, r 60', '75 / 75, r 60, ai', T([x([], [60]), x([33])], [x([75], [60]), x([75], [60])], [x([75], [60], 1), x([75], [60], 1)], 3)],
];
const out = [];
for (const [f, t, r, tree] of trees) {
  const cfg = { board: cards('Ks7d2c'), pot: 5.5, stack: 97.5, ranges, tree };
  const top = E.buildGame(cfg, { topOnly: true }), used = new Set(cfg.board); let c0 = 0; while (used.has(c0)) c0++;
  const own = new Array(52).fill(false); own[c0] = true; const one = E.buildGame(cfg, { own }), K = 49;
  const mem = top.memBytes + (one.memBytes - top.memBytes) * K, dec = top.decisions.length + (one.decisions.length - top.decisions.length) * K;
  const row = { flop: f, turn: t, river: r, MB: mem / 1e6, decisions: dec };
  if (mem < 1e9) { const full = E.buildGame(cfg); row.actualMB = full.memBytes / 1e6; row.actualDecisions = full.decisions.length; }
  out.push(row); console.log(f, '|', t, '|', r, '|', (mem / 1e6).toFixed(1), 'MB', dec, row.actualMB ? 'actual ' + row.actualMB.toFixed(1) + ' MB ' + row.actualDecisions : '');
}
fs.writeFileSync(__dirname + '/out/memest.json', JSON.stringify(out));
