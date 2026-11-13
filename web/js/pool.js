/* Parallel solver: a coordinator owns the tree above the first chance level and K workers own the subtrees below it,
   split by the dealt card. One traversal for player p is three steps:
     1. the coordinator walks its tree and records both reach vectors at every first-level chance node;
     2. every worker returns, for each of these nodes, the sum over its own cards of the child values;
     3. the coordinator divides the summed values by the number of cards and walks its tree again, updating regrets.
   Games without a chance node (river spots) run whole in one worker. Works in browsers (Web Workers) and in Node
   (worker_threads). All methods are asynchronous. */
(function (root) {
  'use strict';
  const isNode = typeof window === 'undefined' && typeof importScripts === 'undefined';
  const E = isNode ? require('./engine.js') : root.PSEngine;
  function ownSets(board, K) {
    const used = new Set(board), own = Array.from({ length: K }, () => new Array(52).fill(false)); let k = 0;
    for (let c = 0; c < 52; c++) if (!used.has(c)) { own[k % K][c] = true; k++; }
    return own;
  }
  function spawn(url) {
    let w, pending = new Map(), seq = 0;
    const onmsg = m => { const cb = pending.get(m.id); if (!cb) return; pending.delete(m.id); if (m.error) cb.reject(new Error(m.error)); else cb.resolve(m); };
    if (isNode) { const { Worker } = require('worker_threads'); w = new Worker(require('path').join(__dirname, 'worker.js')); w.on('message', onmsg); }
    else { w = new Worker(url || 'js/worker.js'); w.onmessage = e => onmsg(e.data); }
    return {
      call(msg, transfer) { const id = ++seq; msg.id = id; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); w.postMessage(msg, transfer || []); }); },
      terminate() { w.terminate(); },
    };
  }
  function plainCfg(cfg) { return Object.assign({}, cfg, { ranges: cfg.ranges.map(r => Array.from(r)) }); }

  function Pool() {}
  /* cfg: game config as for buildGame; options: { workers, opts (solver options), url (worker script) } */
  Pool.create = async function (cfg, options) {
    options = options || {};
    const P = new Pool(); P.cfg = cfg; P.t = 0; P.opts = options.opts || {};
    P.coord = new E.Solver(E.buildGame(cfg, { topOnly: true }), P.opts);
    const g = P.coord.g; P.g = g;
    P.chance = g.top.length > 0;
    const hw = isNode ? require('os').cpus().length : (navigator.hardwareConcurrency || 4);
    const K = P.chance ? Math.max(1, Math.min(options.workers || hw, 52 - cfg.board.length)) : 1;
    P.own = P.chance ? ownSets(cfg.board, K) : [null];
    P.workers = P.own.map(() => spawn(options.url));
    const pc = plainCfg(cfg);
    const info = await Promise.all(P.workers.map((w, k) => w.call({ type: 'init', cfg: pc, own: P.own[k], opts: P.opts })));
    // every worker also builds the coordinator's part of the tree; count it once
    P.decisions = info.reduce((s, x) => s + x.decisions, 0) - (P.chance ? (K - 1) * g.decisions.length : 0);
    P.memBytes = info.reduce((s, x) => s + x.memBytes, 0);
    P.K = K;
    return P;
  };
  Pool.prototype.terminate = function () { for (const w of this.workers) w.terminate(); };
  Pool.prototype.ownerOf = function (card) { for (let k = 0; k < this.own.length; k++) if (this.own[k] && this.own[k][card]) return k; return -1; };
  Pool.prototype.pass = async function (p, mode, start, ro0, rs0) {
    const c = this.coord, g = this.g; c.t = this.t;
    const reaches = c.collectTop(p, mode, start, ro0, rs0);
    const plain = reaches.map(r => r ? { ro: r.ro, rs: r.rs } : null);
    const parts = await Promise.all(this.workers.map(w => w.call({ type: 'partials', p, mode, t: this.t, reaches: plain })));
    const sums = reaches.map(r => r ? new Float64Array(g.n[p]) : null);
    for (const m of parts) m.sums.forEach((v, k) => { if (v) { const s = sums[k]; for (let i = 0; i < v.length; i++) s[i] += v[i]; } });
    return c.finishTop(p, mode, sums, start, ro0, rs0);
  };
  Pool.prototype.iterate = async function (n) {
    n = n || 1;
    if (!this.chance) { const r = await this.workers[0].call({ type: 'iterate', n }); this.t = r.t; return; }
    for (let i = 0; i < n; i++) { this.t++; await this.pass(0, 0); await this.pass(1, 0); }
  };
  Pool.prototype.evaluate = async function () {
    if (!this.chance) return (await this.workers[0].call({ type: 'evaluate' })).res;
    const g = this.g, res = { br: [0, 0], val: [0, 0] };
    for (let p = 0; p < 2; p++) for (const [mode, key] of [[1, 'br'], [2, 'val']]) {
      const v = await this.pass(p, mode); let s = 0; for (let i = 0; i < g.n[p]; i++) s += g.W[p][i] * v[i]; res[key][p] = s / g.Z;
    }
    res.expl = ((res.br[0] - res.val[0]) + (res.br[1] - res.val[1])) / 2; res.exploitPct = 100 * res.expl / g.pot;
    return res;
  };
  /* split a root path into the coordinator part and the worker part */
  Pool.prototype.split = function (path) {
    const g = this.g; let nd = g.root;
    for (let k = 0; k < path.length; k++) {
      if (nd.t === 'c' && nd.cid >= 0 && this.chance) {
        const head = path.slice(0, k), reach = E.reachAt(g, head);
        return { worker: this.ownerOf(path[k]), loc: { top: nd.cid, card: path[k], path: path.slice(k + 1), reach } };
      }
      nd = nd.ch[path[k]]; if (!nd) return null;
    }
    return { worker: -1, nd, loc: { top: -1, path } };
  };
  /* analysis of the node at path; see engine analyseNode */
  Pool.prototype.analyse = async function (path) {
    const s = this.split(path); if (!s) return null;
    if (!this.chance) return (await this.workers[0].call({ type: 'analyse', loc: { top: -1, path } })).res;
    if (s.worker >= 0) return (await this.workers[s.worker].call({ type: 'analyse', loc: s.loc })).res;
    // a node of the coordinator's tree: values come from a distributed pass that starts at this node
    const g = this.g, nd = s.nd, reach = E.reachAt(g, path), vals = [];
    const nmax = Math.max(g.n[0], g.n[1]);
    for (let p = 0; p < 2; p++) {
      const ro = new Float64Array(nmax), rs = new Float64Array(nmax); ro.set(reach[1 - p]); rs.set(reach[p]);
      vals.push(await this.pass(p, 2, nd, ro, rs));
    }
    const fake = { walk: (node, p) => vals[p], ext: null };
    return E.analyseNode(g, fake, nd, reach);
  };
  /* lock the node at path to a hand-major strategy (null unlocks) */
  Pool.prototype.lock = async function (path, strat) {
    const s = this.split(path); if (!s) return false;
    if (!this.chance) return (await this.workers[0].call({ type: 'lock', loc: { top: -1, path }, strat })).ok;
    if (s.worker >= 0) return (await this.workers[s.worker].call({ type: 'lock', loc: s.loc, strat })).ok;
    if (s.nd.t !== 'd') return false;
    if (strat) E.lockNode(this.g, s.nd, strat); else E.unlockNode(this.g, s.nd);
    return true;
  };
  /* tree navigation for the interface, from the coordinator's view (below the first chance level the shape of the
     subtree is the same for every card, so the coordinator answers from the card's owner only when asked to) */
  Pool.prototype.nodeInfo = function (path) { const s = this.split(path); return s; };
  const api = { Pool, ownSets };
  if (isNode && typeof module !== 'undefined') module.exports = api; else root.PSPool = api;
})(typeof self !== 'undefined' ? self : this);
