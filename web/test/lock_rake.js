const E = require('../js/engine.js'), { Pool } = require('../js/pool.js');
(async () => {
  const tree = { streets: { river: { oop: { bet: [] }, ip: { bet: [75], allin: true } } }, maxBets: 2 };
  const cfg = { board: 'Ks7d2c5h9s'.match(/../g).map(E.cardOf), pot: 10, stack: 40, ranges: [E.parseRange('22+,A2s+,KTs+,QTs+,JTs,ATo+,KJo+'), E.parseRange('55+,A8s+,KQs,AJo+,T9s,87s')], tree };
  // 1. rake: the two values sum to minus the expected rake, which is positive and below the cap
  for (const rake of [{ pct: 0, cap: 0 }, { pct: 5, cap: 1 }]) {
    const s = new E.Solver(E.buildGame(Object.assign({}, cfg, { rake }))); s.iterate(2000); const r = s.evaluate();
    console.log('rake', JSON.stringify(rake), 'val0+val1', (r.val[0] + r.val[1]).toFixed(4), 'expl%', r.exploitPct.toFixed(3));
  }
  // 2. lock: IP after OOP check always bets 75%; OOP's best response then gains
  const s = new E.Solver(E.buildGame(cfg)); s.iterate(2000); const base = s.evaluate();
  const g = s.g, nd = E.nodeAt(g, [0]); const n = g.n[nd.p];
  const lockS = new Float64Array(n * nd.na); for (let i = 0; i < n; i++) lockS[i * nd.na + 1] = 1;   // action 1 = bet
  E.lockNode(g, nd, lockS); s.iterate(2000); const locked = s.evaluate();
  const a = s.analyse([0]); console.log('locked freqs', a.freq.map(x => x.toFixed(3)).join(' '));
  console.log('value OOP before', base.val[0].toFixed(4), 'after lock', locked.val[0].toFixed(4), 'expl% (locked game)', locked.exploitPct.toFixed(3));
  // 3. the pool gives the same locked solution
  const P = await Pool.create(cfg, {}); await P.lock([0], lockS); await P.iterate(4000); const pr = await P.evaluate();
  const s2 = new E.Solver(E.buildGame(cfg)); E.lockNode(s2.g, E.nodeAt(s2.g, [0]), lockS); s2.iterate(4000); const sr = s2.evaluate();
  console.log('pool locked val0', pr.val[0].toFixed(8), 'seq', sr.val[0].toFixed(8)); P.terminate();
})();
