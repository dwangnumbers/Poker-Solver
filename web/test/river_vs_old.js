const E = require('../js/engine.js'), O = require('../../app/src/solver.js');
const board = ['Ks','7d','2c','Th','4s'].map(E.cardOf);
const tree = { streets: { flop:{oop:{bet:[]},ip:{bet:[]}}, turn:{oop:{bet:[]},ip:{bet:[]}},
  river: { oop: { bet: [33, 75], raise: [100], allin: true }, ip: { bet: [33, 75], raise: [100], allin: true } } },
  maxBets: 2, allinThreshold: 2, mergeTolerance: 0 };
const g = E.buildGame({ board, pot: 100, stack: 100, ranges: [E.parseRange(O.BB_CALL), E.parseRange(O.BTN_OPEN)], tree });
console.log('n', g.n, 'decisions', g.decisions.length, 'nodes', g.nodes, 'Z', g.Z, 'mem MB', (g.memBytes/1e6).toFixed(2));
const s = new E.Solver(g); let t0 = Date.now();
for (const T of [1000, 5000]) { s.iterate(T - s.t); const r = s.evaluate(); console.log(T, 'expl', r.expl.toExponential(4), 'val0', r.val[0].toFixed(5), 'ms', Date.now() - t0); }
const a = s.analyse([]); console.log('root freqs', a.freq.map(x => x.toFixed(3)));
// old solver
const go = O.createGame({ board, pot: 100, stack: 100, bets: [[.33,.75],[.33,.75]], raises: [1], maxRaises: 2, weights: [O.parseRange(O.BB_CALL), O.parseRange(O.BTN_OPEN)] });
const so = new O.Solver(go, 'dcfr'); for (let i = 0; i < 5000; i++) so.step();
console.log('old expl', so.exploitability().toExponential(4), 'old Z', go.Z, 'decisions', go.decisions.length);
