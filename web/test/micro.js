const E = require('../js/engine.js');
const BB = '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o,87o,-QQ+,-AKs,-AKo,-A5s';
const BTN = '22+,A2s+,K5s+,Q8s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,A7o+,K9o+,QTo+,JTo';
const S = (oop, ip) => ({ oop, ip });
const tree = { streets: { flop: S({ bet: [], raise: [50] }, { bet: [33], raise: [] }), turn: S({ bet: [], raise: [] }, { bet: [75], raise: [] }), river: S({ bet: [75], raise: [] }, { bet: [75], raise: [], allin: true }) }, maxBets: 2, allinThreshold: 0.67, mergeTolerance: 0.1 };
const cfg = { board: 'Ks7d2c'.match(/../g).map(E.cardOf), pot: 5.5, stack: 97.5, ranges: [E.parseRange(BB), E.parseRange(BTN)], tree };
const g = E.buildGame(cfg);
let nf = 0, ns = 0, nc = 0, nd = 0, work = 0;
(function cnt(x) { if (!x) return; if (x.t === 'f') nf++; else if (x.t === 's') ns++; else if (x.t === 'c') { nc++; x.cards.forEach(c => cnt(x.ch[c])); } else { nd++; work += g.n[x.p] * x.na; x.ch.forEach(cnt); } })(g.root);
console.log({ nf, ns, nc, nd, workM: work / 1e6, n: g.n });
// time one showdown
const leaf = (function find(x) { if (x.t === 's') return x; if (x.t === 'c') return find(x.ch[x.cards[0]]); for (const c of x.ch) { const r = find(c); if (r) return r; } return null; })(g.root);
const ro = new Float64Array(g.W[1]), out = new Float64Array(2000);
E.showValue(g, leaf, 0, ro, out);
let t0 = process.hrtime.bigint(); for (let k = 0; k < 20000; k++) E.showValue(g, leaf, 0, ro, out); let dt = Number(process.hrtime.bigint() - t0) / 20000;
console.log('showdown us', (dt / 1000).toFixed(2));
t0 = process.hrtime.bigint(); for (let k = 0; k < 20000; k++) E.foldMass(g, 0, ro, out, null); dt = Number(process.hrtime.bigint() - t0) / 20000;
console.log('fold us', (dt / 1000).toFixed(2));
