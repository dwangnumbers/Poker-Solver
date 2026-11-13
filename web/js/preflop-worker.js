/* Preflop solver worker: { type: 'init', cfg } builds the tree; 'iterate' { n }; 'evaluate'; 'analyse' { path };
   'lock' { path, strat }. Replies echo the request id. */
importScripts('engine.js', 'preflop.js');
let tab = null, tree = null, solver = null;
const P = self.PSPreflop;
function plainNode(n) { return n.t === 'd' ? { t: 'd', p: n.p, c: n.c, acts: n.acts, na: n.na, locked: !!n.lock } : { t: n.t, in: n.in, c: n.c, pot: n.pot }; }
self.onmessage = async e => {
  const m = e.data;
  try {
    if (!tab) tab = await P.loadTables('../data/');
    if (m.type === 'init') {
      tree = P.buildTree(m.cfg); solver = new P.Solver(tree, tab, { ranges: m.ranges || [] });
      self.postMessage({ id: m.id, decisions: tree.decisions.length, terminals: tree.terminals, names: tree.names, N: tree.N });
    } else if (m.type === 'iterate') { solver.iterate(m.n); self.postMessage({ id: m.id, t: solver.t }); }
    else if (m.type === 'evaluate') self.postMessage({ id: m.id, res: solver.evaluate() });
    else if (m.type === 'analyse') {
      const a = solver.analyse(m.path); const n = a.node;
      self.postMessage({ id: m.id, res: { node: plainNode(n), reach: a.reach, strategy: a.strategy, actEV: a.actEV, ev: a.ev, freq: a.freq, children: n.t === 'd' ? n.ch.map(plainNode) : [] } });
    } else if (m.type === 'lock') {
      let n = tree.root; for (const a of m.path) n = n.ch[a];
      n.lock = m.strat ? Float64Array.from(m.strat) : null; self.postMessage({ id: m.id, ok: true });
    }
  } catch (err) { self.postMessage({ id: m.id, error: String(err && err.stack || err) }); }
};
