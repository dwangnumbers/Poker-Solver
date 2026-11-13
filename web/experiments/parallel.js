/* Parallel partition: time per iteration with 1 and 2 workers, coordinator share, message volume, and the check that
   the partitioned iterates equal the sequential ones. node parallel.js -> out/parallel.json */
const { E, SPOTS } = require('./spots.js'), { Pool } = require('../js/pool.js'), fs = require('fs'), os = require('os');
(async () => {
  const res = { cores: os.cpus().length, rows: [] };
  for (const key of ['turn', 'flop']) {
    const cfg = SPOTS[key].cfg;
    const seq = new E.Solver(E.buildGame(cfg)); seq.iterate(1); let t0 = Date.now(); seq.iterate(3); const tSeq = (Date.now() - t0) / 3;
    const ev = seq.evaluate();
    for (const K of [1, 2]) {
      const P = await Pool.create(cfg, { workers: K }); await P.iterate(1);
      t0 = Date.now(); await P.iterate(3); const tPool = (Date.now() - t0) / 3;
      // the same iterates: compare with the sequential run of 4 iterations
      const r = await P.evaluate();
      // coordinator time per pass (value mode, no updates) and data moved per pass (reach vectors out, sums back)
      const c = P.coord, g = P.g; let tc = Date.now(); for (let k = 0; k < 10; k++) { const rr = c.collectTop(0, 2); c.finishTop(0, 2, rr.map(r => r ? new Float64Array(g.n[0]) : null)); } tc = (Date.now() - tc) / 10;
      const tops = g.top.length, bytes = tops * (g.n[0] + g.n[1]) * 8 + tops * g.n[0] * 8;
      res.rows.push({ spot: key, K, msSeq: tSeq, msPool: tPool, coordMsPerPass: tc, topNodes: tops, bytesPerPassPerWorker: bytes, explSeq: ev.expl, explPool: r.expl, equal: ev.expl === r.expl });
      console.log(JSON.stringify(res.rows[res.rows.length - 1]));
      P.terminate();
    }
  }
  fs.writeFileSync(__dirname + '/out/parallel.json', JSON.stringify(res));
})();
