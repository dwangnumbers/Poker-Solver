/* Convergence of CFR, CFR+ and DCFR: exploitability (% of pot) against iterations and time.
   node conv.js spot maxIt [workers] -> out/conv_<spot>.json */
const { E, SPOTS, ALGOS } = require('./spots.js'), { Pool } = require('../js/pool.js'), fs = require('fs');
(async () => {
  const spot = process.argv[2] || 'river', maxIt = +process.argv[3] || 1000, W = +process.argv[4] || 2, sp = SPOTS[spot];
  const checks = new Set(); for (let k = 1; k <= maxIt; k = Math.ceil(k * 1.25)) checks.add(k); checks.add(maxIt);
  const out = { spot, name: sp.name, series: {} };
  for (const [name, opts] of Object.entries(ALGOS)) {
    const P = await Pool.create(sp.cfg, { workers: W, opts }); const pts = []; let ms = 0;
    for (let it = 1; it <= maxIt; it++) {
      const t0 = Date.now(); await P.iterate(1); ms += Date.now() - t0;
      if (checks.has(it)) { const r = await P.evaluate(); pts.push([it, r.exploitPct, ms]); if (it % 50 === 0 || it === maxIt) console.log(spot, name, it, r.exploitPct.toExponential(3), ms + 'ms'); }
    }
    out.series[name] = pts; out.decisions = P.decisions; out.memBytes = P.memBytes; P.terminate();
    fs.writeFileSync(__dirname + `/out/conv_${spot}.json`, JSON.stringify(out));
  }
})();
