/* Solver worker (browser Web Worker or Node worker_threads). It owns the subtrees below the first chance level for a
   subset of cards, or the whole game when the game has no chance node. Requests carry an id; replies echo it.
     init     { cfg, own, opts }            build the game (own = null: whole game) and the solver
     partials { p, mode, t, reaches }       per first-level chance node, the sum over owned cards of child values
     iterate  { n }                         whole-game iterations (games without chance nodes)
     evaluate {}                            exploitability (games without chance nodes)
     analyse  { loc }                       analysis of the node at loc
     lock     { loc, strat }                lock (strat = hand-major strategy) or unlock (strat = null) the node at loc
   loc = { top, card, path, reach }: below first-level chance node `top` after `card`, then `path`; reach is both
   players' reach at that chance node. With top = -1, path starts at the root and reach is not needed. */
(function () {
  'use strict';
  const isNode = typeof self === 'undefined' || typeof importScripts === 'undefined';
  let E, post;
  if (isNode) {
    const { parentPort } = require('worker_threads'); E = require('./engine.js');
    post = (m, tr) => parentPort.postMessage(m, tr); parentPort.on('message', handle);
  } else {
    importScripts('engine.js'); E = self.PSEngine;
    post = (m, tr) => self.postMessage(m, tr); self.onmessage = e => handle(e.data);
  }
  let g = null, solver = null;
  function locate(loc) {
    if (loc.top < 0) return { nd: E.nodeAt(g, loc.path), reach: E.reachAt(g, loc.path) };
    const start = g.top[loc.top].ch[loc.card]; if (!start) return { nd: null };
    const r = loc.reach.map(x => Float64Array.from(x));
    for (let p = 0; p < 2; p++) for (const i of g.withCard[p][loc.card]) r[p][i] = 0;
    return { nd: E.nodeAt(g, loc.path, start), reach: E.reachAt(g, loc.path, start, r) };
  }
  function handle(m) {
    try {
      if (m.type === 'init') {
        const cfg = Object.assign({}, m.cfg, { ranges: m.cfg.ranges.map(r => Float64Array.from(r)) });
        g = E.buildGame(cfg, m.own ? { own: m.own } : null);
        solver = new E.Solver(g, m.opts || {});
        post({ id: m.id, decisions: g.decisions.length, memBytes: g.memBytes, top: g.top.length, n: g.n });
      } else if (m.type === 'partials') {
        solver.t = m.t;
        const sums = solver.chancePartials(m.p, m.mode, m.reaches);
        post({ id: m.id, sums }, sums.filter(Boolean).map(v => v.buffer));
      } else if (m.type === 'iterate') {
        solver.iterate(m.n); post({ id: m.id, t: solver.t });
      } else if (m.type === 'evaluate') {
        post({ id: m.id, res: solver.evaluate() });
      } else if (m.type === 'analyse') {
        const { nd, reach } = locate(m.loc);
        post({ id: m.id, res: nd ? E.analyseNode(g, solver, nd, reach) : null });
      } else if (m.type === 'lock') {
        const { nd } = locate(m.loc);
        if (nd && nd.t === 'd') { if (m.strat) E.lockNode(g, nd, m.strat); else E.unlockNode(g, nd); }
        post({ id: m.id, ok: !!(nd && nd.t === 'd') });
      } else post({ id: m.id, error: 'unknown request ' + m.type });
    } catch (err) { post({ id: m.id, error: String(err && err.stack || err) }); }
  }
})();
