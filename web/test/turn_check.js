const E = require('../js/engine.js'); const fs = require('fs'); const { execSync } = require('child_process');
// deterministic pseudo-random hand selection
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const board = ['Ks','7d','2c','Th'];
const bc = board.map(E.cardOf);
function pick(k) { const out = new Set(); while (out.size < k) { const a = Math.floor(rnd() * 52), b = Math.floor(rnd() * 52); if (a === b || bc.includes(a) || bc.includes(b)) continue; out.add(E.COMBO_ID[a * 52 + b]); } return [...out]; }
const H = [pick(14), pick(12)];
const toStr = k => E.cardStr(E.COMBO_A[k]) + E.cardStr(E.COMBO_B[k]);
const cfg = { board, hands: H.map(l => l.map(toStr)), pot: 100, stack: 1000, turn_bet: 0.5, river_bet: 1.0 };
fs.writeFileSync('/tmp/turn_cfg.json', JSON.stringify(cfg));
const ranges = H.map(l => { const r = new Float64Array(1326); for (const k of l) r[k] = 1; return r; });
const tree = { streets: { flop: { oop: { bet: [] }, ip: { bet: [] } },
  turn: { oop: { bet: [50] }, ip: { bet: [50] } }, river: { oop: { bet: [100] }, ip: { bet: [100] } } }, maxBets: 1, allinThreshold: 2, mergeTolerance: 0 };
const g = E.buildGame({ board: bc, pot: 100, stack: 1000, ranges, tree });
const s = new E.Solver(g);
for (const T of [2000, 20000]) { s.iterate(T - s.t); const r = s.evaluate(); console.log('JS', T, 'value0', r.val[0].toFixed(8), 'expl', r.expl.toExponential(3), 'Z', g.Z); }
console.log('LP', execSync('python3 /home/claude/poker-solver/web/test/turn_lp.py /tmp/turn_cfg.json').toString().trim());
