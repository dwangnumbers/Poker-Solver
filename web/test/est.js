const E = require('../js/engine.js');
const U = { 'BB': '22-JJ,A2s-AJs,K2s-KJs,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o-AJo,K8o-KJo,Q9o+,J9o+,T8o+,98o,87o', 'BTN': '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A3o+,K9o+,Q9o+,J9o+,T9o' };
function est(tree, board) {
  const cfg = { board: (board || 'Ks7d2c').match(/../g).map(E.cardOf), pot: 5.5, stack: 97.5, ranges: [E.parseRange(U.BB), E.parseRange(U.BTN)], tree };
  const top = E.buildGame(cfg, { topOnly: true }); const own = new Array(52).fill(false); const used = new Set(cfg.board); let c0 = 0; while (used.has(c0)) c0++; own[c0] = true; const one = E.buildGame(cfg, { own }); const K = 49;
  const dec = top.decisions.length + (one.decisions.length - top.decisions.length) * K, mem = top.memBytes + (one.memBytes - top.memBytes) * K;
  let work = 0; const w1 = one.decisions.reduce((s, d) => s + one.n[d.p] * d.na, 0), w0 = top.decisions.reduce((s, d) => s + top.n[d.p] * d.na, 0); work = w0 + (w1 - w0) * K;
  return `dec ${dec} mem ${(mem / 1e6).toFixed(0)}MB work ${(work / 1e6).toFixed(0)}M`;
}
const T = (f, t, r, mb) => ({ streets: { flop: { oop: f[0], ip: f[1] }, turn: { oop: t[0], ip: t[1] }, river: { oop: r[0], ip: r[1] } }, maxBets: mb || 2, allinThreshold: 0.67, mergeTolerance: 0.1 });
const x = (b, r, a) => ({ bet: b || [], raise: r || [], allin: !!a });
console.log('A tiny ', est(T([x(), x([33])], [x(), x([75])], [x(), x([75], [], 1)])));
console.log('B small', est(T([x([], [50]), x([33])], [x(), x([75])], [x([75]), x([75], [], 1)])));
console.log('C      ', est(T([x([], [50]), x([33])], [x([75]), x([75])], [x([75]), x([75])])));
console.log('D      ', est(T([x([], []), x([33])], [x([75]), x([75])], [x([75]), x([75])])));
console.log('E      ', est(T([x([], [50]), x([33])], [x([66]), x([66], [50])], [x([75]), x([75], [], 1)], 2)));
console.log('F std  ', est(T([x([], [50]), x([33, 75])], [x(), x([75], [50])], [x([75], [], 1), x([75], [], 1)], 2)));
console.log('G      ', est(T([x([], [60]), x([33])], [x([75], [60]), x([75], [60])], [x([75], [60], 1), x([75], [60], 1)], 3)));
