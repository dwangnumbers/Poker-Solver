/* Spots used by the experiments (and in the talk). */
const E = require('../js/engine.js');
const R = {
  BB: '22-JJ,A2s-AJs,K2s-KJs,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o-AJo,K8o-KJo,Q9o+,J9o+,T8o+,98o,87o',
  BTN: '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A3o+,K9o+,Q9o+,J9o+,T9o',
  TBB: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o,87o,-QQ+,-AKs,-AKo,-A5s',
  TBTN: '22+,A2s+,K5s+,Q8s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,A7o+,K9o+,QTo+,JTo',
};
const x = (b, r, a) => ({ bet: b || [], raise: r || [], allin: !!a });
const T = (f, t, r, mb) => ({ streets: { flop: { oop: f[0], ip: f[1] }, turn: { oop: t[0], ip: t[1] }, river: { oop: r[0], ip: r[1] } }, maxBets: mb || 2, allinThreshold: 0.67, mergeTolerance: 0.1 });
const cards = s => s.match(/../g).map(E.cardOf);
const SPOTS = {
  river: { name: 'River, talk example', cfg: { board: cards('Ks7d2cTh4s'), pot: 100, stack: 100, ranges: [E.parseRange(R.TBB), E.parseRange(R.TBTN)], tree: T([x(), x()], [x(), x()], [x([33, 75], [100], 1), x([33, 75], [100], 1)], 2) } },
  turn: { name: 'Turn, K72-5', cfg: { board: cards('Ks7d2c5h'), pot: 12, stack: 91, ranges: [E.parseRange(R.BB), E.parseRange(R.BTN)], tree: T([x(), x()], [x([75]), x([75], [50])], [x([75], [], 1), x([75], [], 1)], 2) } },
  flop: { name: 'Flop, K72 rainbow', cfg: { board: cards('Ks7d2c'), pot: 5.5, stack: 97.5, ranges: [E.parseRange(R.BB), E.parseRange(R.BTN)], tree: T([x(), x([33])], [x([75]), x([75])], [x([75]), x([75])], 2) } },
  flopx: { name: 'Flop, later streets checked down', cfg: { board: cards('Ks7d2c'), pot: 5.5, stack: 97.5, ranges: [E.parseRange(R.BB), E.parseRange(R.BTN)], tree: T([x([33], [50]), x([33, 75], [50])], [x(), x()], [x(), x()], 2) } },
};
const ALGOS = { CFR: { alpha: Infinity, beta: Infinity, gamma: 0 }, 'CFR+': { alpha: Infinity, beta: -Infinity, gamma: 1 }, DCFR: { alpha: 1.5, beta: 0, gamma: 2 } };
module.exports = { E, R, x, T, cards, SPOTS, ALGOS };
