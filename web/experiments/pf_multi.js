/* Multiway preflop: cost per iteration and NashConv against iterations. node pf_multi.js [maxIt] -> out/pf_multi.json */
const P = require('../js/preflop.js'), fs = require('fs');
const GAMES = {
  '3-handed push or fold, 12 bb': { players: 3, stack: 12, ante: 0.1, maxRaises: 1, allinThreshold: 0, maxToFlop: 3, sbLimp: false },
  '6-max push or fold, 10 bb': { players: 6, stack: 10, ante: 0.125, maxRaises: 1, allinThreshold: 0, maxToFlop: 3, sbLimp: false },
  '6-max, 20 bb, raise or shove': { players: 6, stack: 20, ante: 0.125, open: 2.1, sbOpen: 2.5, threebetIP: 3, threebetOOP: 3.5, fourbet: 2.2, maxRaises: 3, allinThreshold: 0.4, maxToFlop: 2, sbLimp: true },
  '6-max, 100 bb': { players: 6, stack: 100, maxRaises: 4, maxToFlop: 2 },
};
(async () => {
  const tab = await P.loadTables(), maxIt = +process.argv[2] || 1000, res = {};
  for (const [name, cfg] of Object.entries(GAMES)) {
    const tree = P.buildTree(cfg), s = new P.Solver(tree, tab), pts = []; let ms = 0;
    let three = 0; (function w(n) { if (n.t === 'd') n.ch.forEach(w); else if (n.t === 's' && n.in.length === 3) three++; })(tree.root);
    const lim = tree.decisions.length > 2000 ? Math.min(maxIt, 300) : maxIt;
    for (let k = 1; k <= lim; k = Math.ceil(k * 1.4)) { const t0 = Date.now(); s.iterate(k - s.t); ms += Date.now() - t0; const r = s.evaluate(); pts.push([k, r.nashConv, ms]); }
    const r = s.evaluate();
    res[name] = { decisions: tree.decisions.length, terminals: tree.terminals, three, pts, msPerIter: ms / s.t, val: r.val, gains: r.gains };
    console.log(name, '| decisions', tree.decisions.length, 'three-way', three, '| ms/iter', (ms / s.t).toFixed(1), '| NashConv', r.nashConv.toExponential(2), 'bb, after', s.t);
    fs.writeFileSync(__dirname + '/out/pf_multi.json', JSON.stringify(res));
  }
})();
