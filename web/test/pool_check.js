const E = require('../js/engine.js'), { Pool } = require('../js/pool.js');
(async () => {
  const S = (oop, ip) => ({ oop, ip });
  const tree = { streets: { flop: S({ bet: [] }, { bet: [50] }), turn: S({ bet: [] }, { bet: [75] }), river: S({ bet: [75] }, { bet: [75], allin: true }) }, maxBets: 2 };
  for (const board of ['Ks7d2c5h', 'Ks7d2c', 'Ks7d2c5h9s']) {
    const cfg = { board: board.match(/../g).map(E.cardOf), pot: 10, stack: 40, ranges: [E.parseRange('22+,A2s+,KTs+,QTs+,JTs,ATo+,KJo+'), E.parseRange('55+,A8s+,KQs,AJo+')], tree };
    let t0 = Date.now(); const s = new E.Solver(E.buildGame(cfg)); s.iterate(30); const a = s.evaluate(); const t1 = Date.now() - t0;
    t0 = Date.now(); const P = await Pool.create(cfg, { workers: 3 }); await P.iterate(30); const b = await P.evaluate(); const t2 = Date.now() - t0;
    const path = board.length === 6 ? [0, 0, 5, 0] : board.length === 8 ? [0, 1, 0] : [1, 0];
    const x = s.analyse(path), y = await P.analyse(path);
    let d = 0; for (const p of [0, 1]) for (let i = 0; i < x.ev[p].ev.length; i++) if (!isNaN(x.ev[p].ev[i])) d = Math.max(d, Math.abs(x.ev[p].ev[i] - y.ev[p].ev[i]));
    let ds = 0; if (x.strategy) for (let i = 0; i < x.strategy.length; i++) ds = Math.max(ds, Math.abs(x.strategy[i] - y.strategy[i]));
    const xr = s.analyse([]), yr = await P.analyse([]);
    let dr = 0; for (const p of [0, 1]) for (let i = 0; i < xr.ev[p].ev.length; i++) if (!isNaN(xr.ev[p].ev[i])) dr = Math.max(dr, Math.abs(xr.ev[p].ev[i] - yr.ev[p].ev[i]));
    console.log(board, 'seq', a.expl.toExponential(6), t1 + 'ms', 'pool', b.expl.toExponential(6), t2 + 'ms', 'K', P.K, 'dEV(node)', d.toExponential(2), 'dStrat', ds.toExponential(2), 'dEV(root)', dr.toExponential(2));
    P.terminate();
  }
})();
