const E = require('../js/engine.js');
const x = (b, r, a) => ({ bet: b || [], raise: r || [], allin: !!a });
const tree = { streets: { flop: { oop: x([33], [50]), ip: x([33, 75], [50]) }, turn: { oop: x(), ip: x() }, river: { oop: x(), ip: x() } }, maxBets: 2 };
const cfg = { board: 'Ks7d2c'.match(/../g).map(E.cardOf), pot: 5.5, stack: 97.5, ranges: [E.parseRange('22-JJ,A2s-AJs,K2s-KJs,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o-AJo,K8o-KJo,Q9o+,J9o+,T8o+,98o,87o'), E.parseRange('22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A3o+,K9o+,Q9o+,J9o+,T9o')], tree };
let t = Date.now(); const g = E.buildGame(cfg); const s = new E.Solver(g); console.log('build', Date.now() - t, 'dec', g.decisions.length);
t = Date.now(); s.iterate(1); console.log('first it', Date.now() - t);
t = Date.now(); s.iterate(10); console.log('per it', (Date.now() - t) / 10);
for (const k of [50, 100, 200]) { s.iterate(k - s.t); const r = s.evaluate(); console.log(k, r.exploitPct.toFixed(3)); }
