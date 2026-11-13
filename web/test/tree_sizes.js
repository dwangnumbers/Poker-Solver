const E = require('../js/engine.js');
const BB = '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o,87o,-QQ+,-AKs,-AKo,-A5s';
const BTN = '22+,A2s+,K5s+,Q8s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,A7o+,K9o+,QTo+,JTo';
const board = 'Ks7d2c'.match(/../g).map(E.cardOf);
const S = (oop, ip) => ({ oop, ip });
const cfgs = {
  tiny: { flop: S({ bet: [] , raise: [] }, { bet: [33], raise: [] }), turn: S({ bet: [], raise: [] }, { bet: [75], raise: [] }), river: S({ bet: [], raise: [] }, { bet: [75], raise: [], allin: true }), maxBets: 2 },
  small: { flop: S({ bet: [], raise: [50] }, { bet: [33], raise: [] }), turn: S({ bet: [], raise: [] }, { bet: [75], raise: [] }), river: S({ bet: [75], raise: [] }, { bet: [75], raise: [], allin: true }), maxBets: 2 },
  medium: { flop: S({ bet: [], raise: [50] }, { bet: [33], raise: [50] }), turn: S({ bet: [75], raise: [50] }, { bet: [75], raise: [50] }), river: S({ bet: [75], raise: [50], allin: true }, { bet: [75], raise: [50], allin: true }), maxBets: 3 },
  big: { flop: S({ bet: [], raise: [50] }, { bet: [33, 75], raise: [50] }), turn: S({ bet: [75], raise: [50] }, { bet: [50, 100], raise: [50] }), river: S({ bet: [75], raise: [50], allin: true }, { bet: [50, 100], raise: [50], allin: true }), maxBets: 3 },
};
for (const [k, c] of Object.entries(cfgs)) {
  const tree = { streets: { flop: c.flop, turn: c.turn, river: c.river }, maxBets: c.maxBets, allinThreshold: 0.67, mergeTolerance: 0.1 };
  const g = E.buildGame({ board, pot: 5.5, stack: 97.5, ranges: [E.parseRange(BB), E.parseRange(BTN)], tree });
  const work = g.decisions.reduce((s, d) => s + g.n[d.p] * d.na, 0);
  console.log(k.padEnd(7), 'decisions', g.decisions.length, 'mem MB', (g.memBytes / 1e6).toFixed(0), 'work M', (work / 1e6).toFixed(1));
}
