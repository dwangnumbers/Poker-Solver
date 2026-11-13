const E = require('../js/engine.js'), { Pool } = require('../js/pool.js');
(async () => {
  const x = (b, r, a) => ({ bet: b || [], raise: r || [], allin: !!a });
  const tree = { streets: { flop: { oop: x(), ip: x([33]) }, turn: { oop: x([75]), ip: x([75]) }, river: { oop: x([75]), ip: x([75]) } }, maxBets: 2 };
  const cfg = { board: 'Ks7d2c'.match(/../g).map(E.cardOf), pot: 5.5, stack: 97.5, ranges: [E.parseRange('22-JJ,A2s-AJs,K2s-KJs,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o-AJo,K8o-KJo,Q9o+,J9o+,T8o+,98o,87o'), E.parseRange('22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A3o+,K9o+,Q9o+,J9o+,T9o')], tree };
  let t = Date.now(); const P = await Pool.create(cfg, { workers: 2 }); console.log('build', Date.now() - t, P.decisions, (P.memBytes / 1e6).toFixed(0) + 'MB');
  t = Date.now(); await P.iterate(5); console.log('5 it', Date.now() - t);
  t = Date.now(); const r = await P.evaluate(); console.log('eval', Date.now() - t, r.exploitPct.toFixed(2));
  t = Date.now(); await P.analyse([]); console.log('root analyse', Date.now() - t);
  t = Date.now(); await P.analyse([]); console.log('root analyse again', Date.now() - t);
  t = Date.now(); await P.analyse([0, 0, 13]); console.log('turn node analyse', Date.now() - t);
  P.terminate();
})();
