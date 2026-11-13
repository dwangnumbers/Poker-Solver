/* Node locking on the talk's river: lock the in-position player, after a check, to bet 33% of the pot with every hand,
   re-solve, and compare the out-of-position response. node lock.js -> out/lock.json */
const { E, SPOTS } = require('./spots.js'), fs = require('fs');
const cfg = SPOTS.river.cfg, g = E.buildGame(cfg), s = new E.Solver(g);
s.iterate(3000); const base = s.evaluate();
const ipNode = E.nodeAt(g, [0]), betIdx = ipNode.acts.findIndex(a => a.kind === 'bet');   // the 33% bet (75% becomes all-in at this depth)
const before = { ip: s.analyse([0]).freq, oop: s.analyse([0, betIdx]).freq, acts: ipNode.acts.map(a => a.label), oopActs: E.nodeAt(g, [0, betIdx]).acts.map(a => a.label) };
const n = g.n[1], lock = new Float64Array(n * ipNode.na); for (let i = 0; i < n; i++) lock[i * ipNode.na + betIdx] = 1;
E.lockNode(g, ipNode, lock);
const pts = []; for (const k of [10, 30, 100, 300, 1000, 3000]) { s.iterate(k - (s.t - 3000)); const r = s.evaluate(); pts.push([k, r.exploitPct, r.val[0]]); }
const after = { ip: s.analyse([0]).freq, oop: s.analyse([0, betIdx]).freq, root: s.analyse([]).freq };
const res = { base: { val: base.val, expl: base.exploitPct, root: s.analyse ? null : null }, before, after, pts, rootActs: g.root.acts.map(a => a.label) };
console.log('IP after check, before:', before.acts.map((a, i) => a + ' ' + (100 * before.ip[i]).toFixed(1) + '%').join(', '));
console.log('OOP facing the bet before:', before.oopActs.map((a, i) => a + ' ' + (100 * before.oop[i]).toFixed(1) + '%').join(', '));
console.log('OOP facing the bet after :', before.oopActs.map((a, i) => a + ' ' + (100 * after.oop[i]).toFixed(1) + '%').join(', '));
console.log('values before', base.val.map(v => v.toFixed(3)).join(' '), 'after', pts.map(p => p.join(':')).join(' '));
fs.writeFileSync(__dirname + '/out/lock.json', JSON.stringify(res));
