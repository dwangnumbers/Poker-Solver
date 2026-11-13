/* Heads-up push or fold at several stack depths: DCFR convergence and values (compared with the LP in pf_lp.py).
   node pf_hu.js -> out/pf_hu.json */
const P = require('../js/preflop.js'), fs = require('fs');
(async () => {
  const tab = await P.loadTables(), res = {};
  for (const stack of [5, 10, 15, 20]) {
    const tree = P.buildTree({ players: 2, stack, maxRaises: 1, allinThreshold: 0, sbLimp: false, allin: true }), s = new P.Solver(tree, tab);
    const pts = []; const t0 = Date.now();
    for (let k = 1; k <= 3000; k = Math.ceil(k * 1.3)) { s.iterate(k - s.t); const r = s.evaluate(); pts.push([k, r.expl]); }
    const r = s.evaluate(), root = s.analyse([]), call = s.analyse([1]);
    const share = (an, a) => { let x = 0; for (let k = 0; k < 169; k++) x += P.CNT[k] * an.strategy[a * 169 + k]; return x / 1326; };
    res[stack] = { pts, sbValue: r.val[0], push: share(root, 1), call: share(call, 1), ms: Date.now() - t0, iters: s.t };
    console.log(stack, 'bb: SB value', r.val[0].toFixed(5), 'push', (100 * res[stack].push).toFixed(1) + '%', 'call', (100 * res[stack].call).toFixed(1) + '%', 'expl', r.expl.toExponential(2), res[stack].ms + 'ms');
  }
  fs.writeFileSync(__dirname + '/out/pf_hu.json', JSON.stringify(res));
})();
