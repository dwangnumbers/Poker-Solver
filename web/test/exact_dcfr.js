/* The zero-reach shortcut must give exactly the iterates of plain DCFR (every subtree walked, no shortcut). */
const { E, SPOTS } = require('../experiments/spots.js');
for (const key of ['river', 'turn']) {
  const a = new E.Solver(E.buildGame(SPOTS[key].cfg)), b = new E.Solver(E.buildGame(SPOTS[key].cfg)); b.noSkip = true;
  let t0 = Date.now(); a.iterate(60); const ta = Date.now() - t0; t0 = Date.now(); b.iterate(60); const tb = Date.now() - t0;
  let d = 0; for (let k = 0; k < a.g.decisions.length; k++) { const x = a.g.decisions[k], y = b.g.decisions[k]; for (let i = 0; i < x.R.length; i++) d = Math.max(d, Math.abs(x.R[i] - y.R[i]), Math.abs(x.S[i] - y.S[i])); }
  console.log(key, 'max |difference| of regrets and sums', d, 'ms shortcut', ta, 'ms plain', tb);
}
