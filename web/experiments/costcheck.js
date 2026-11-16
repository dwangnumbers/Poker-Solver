/* Out-of-sample check of the cost model: trees on random boards (from the sample.js study) that were not used in the
   fit, timed on one core with the same per-iteration instrumentation as costpairs.js. Run with nothing else running.
   node costcheck.js -> out/costcheck.json */
const { E, R, x, T, cards } = require('./spots.js'), fs = require('fs');
const ranges = [E.parseRange(R.BB), E.parseRange(R.BTN)];
const S1 = T([x([75]), x([75])], [x([75]), x([75])], [x([75]), x([75])], 2);
const S2 = T([x([33, 75], [50]), x([33, 75], [50])], [x([33, 75], [50]), x([33, 75], [50])], [x([33, 75], [50]), x([33, 75], [50])], 2);
const samp = st => JSON.parse(fs.readFileSync(__dirname + `/out/sample_${st}.json`)).boards;
const flops = JSON.parse(fs.readFileSync(__dirname + '/out/sample_flop_S1_0-10.json')).boards;
const cfgs = [];
for (const b of flops.slice(0, 6)) cfgs.push(['flop, one size', b, 5.5, 97.5, S1, 10]);
for (const b of samp('turn_S1').slice(0, 8)) cfgs.push(['turn, one size', b, 12, 91, S1, 40]);
for (const b of samp('turn_S1').slice(0, 8)) cfgs.push(['turn, two sizes, raise', b, 12, 91, S2, 25]);
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
  out.push({ name, board: b, decisions: g.decisions.length, work, rows });
  console.log(name, b, g.decisions.length, 'median ms', rows.map(r => r.ms).sort((a, b) => a - b)[rows.length >> 1].toFixed(1));
  fs.writeFileSync(__dirname + '/out/costcheck.json', JSON.stringify(out));
}
