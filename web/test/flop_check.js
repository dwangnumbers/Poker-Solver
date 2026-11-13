/* Flop game with two chance levels against the exact LP of flop_lp.py. node flop_check.js -> ../experiments/out/flop_lp.json */
const E = require('../js/engine.js'), fs = require('fs'), { execSync } = require('child_process');
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const board = ['Ks', '7d', '2c'], bc = board.map(E.cardOf);
function pick(k) { const out = new Set(); while (out.size < k) { const a = Math.floor(rnd() * 52), b = Math.floor(rnd() * 52); if (a === b || bc.includes(a) || bc.includes(b)) continue; out.add(E.COMBO_ID[a * 52 + b]); } return [...out]; }
const H = [pick(6), pick(5)], toStr = k => E.cardStr(E.COMBO_A[k]) + E.cardStr(E.COMBO_B[k]);
const cfg = { board, hands: H.map(l => l.map(toStr)), pot: 100, flop_bet: 0.5, turn_bet: 1.0 };
fs.writeFileSync('/tmp/flop_cfg.json', JSON.stringify(cfg));
const ranges = H.map(l => { const r = new Float64Array(1326); for (const k of l) r[k] = 1; return r; });
const tree = { streets: { flop: { oop: { bet: [50] }, ip: { bet: [50] } }, turn: { oop: { bet: [100] }, ip: { bet: [100] } }, river: { oop: { bet: [] }, ip: { bet: [] } } }, maxBets: 1, allinThreshold: 2, mergeTolerance: 0 };
const g = E.buildGame({ board: bc, pot: 100, stack: 1000, ranges, tree }), s = new E.Solver(g), out = { hands: H.map(l => l.length), decisions: g.decisions.length, js: [] };
for (const T of [1000, 10000]) { s.iterate(T - s.t); const r = s.evaluate(); out.js.push({ T, value0: r.val[0], expl: r.expl }); console.log('JS', T, r.val[0].toFixed(8), r.expl.toExponential(3)); }
const lp = JSON.parse(execSync('python3 ' + __dirname + '/flop_lp.py /tmp/flop_cfg.json', { maxBuffer: 1e8 }).toString());
out.lp = lp.value0; console.log('LP', lp.value0.toFixed(8));
fs.writeFileSync(__dirname + '/../experiments/out/flop_lp.json', JSON.stringify(out));
