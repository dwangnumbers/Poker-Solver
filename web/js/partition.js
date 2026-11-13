/* In-process driver for the partitioned protocol (used by tests and as the reference for the worker pool). */
(function (root) {
  'use strict';
  const E = (typeof require !== 'undefined') ? require('./engine.js') : root.PSEngine;
  function ownSets(board, K) {
    const used = new Set(board), own = Array.from({ length: K }, () => new Array(52).fill(false)); let k = 0;
    for (let c = 0; c < 52; c++) if (!used.has(c)) { own[k % K][c] = true; k++; }
    return own;
  }
  function Driver(cfg, K) {
    this.coord = new E.Solver(E.buildGame(cfg, { topOnly: true }));
    this.workers = [];
    if (this.coord.g.top.length) for (const own of ownSets(cfg.board, K)) this.workers.push(new E.Solver(E.buildGame(cfg, { own })));
    this.t = 0;
  }
  Driver.prototype.pass = function (p, mode) {
    const reaches = this.coord.collectTop(p, mode);
    const sums = reaches.map((r, k) => r ? new Float64Array(this.coord.g.n[p]) : null);
    for (const w of this.workers) {
      w.t = this.t; const part = w.chancePartials(p, mode, reaches);
      part.forEach((v, k) => { if (v) for (let i = 0; i < v.length; i++) sums[k][i] += v[i]; });
    }
    this.coord.t = this.t;
    return this.coord.finishTop(p, mode, sums);
  };
  Driver.prototype.iterate = function (n) { for (let i = 0; i < (n || 1); i++) { this.t++; this.pass(0, 0); this.pass(1, 0); } };
  Driver.prototype.evaluate = function () {
    const g = this.coord.g, res = { br: [0, 0], val: [0, 0] };
    for (let p = 0; p < 2; p++) for (const [mode, key] of [[1, 'br'], [2, 'val']]) {
      const v = this.pass(p, mode); let s = 0; for (let i = 0; i < g.n[p]; i++) s += g.W[p][i] * v[i]; res[key][p] = s / g.Z;
    }
    res.expl = ((res.br[0] - res.val[0]) + (res.br[1] - res.val[1])) / 2; res.exploitPct = 100 * res.expl / g.pot;
    return res;
  };
  const api = { Driver, ownSets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PSPartition = api;
})(typeof self !== 'undefined' ? self : this);
