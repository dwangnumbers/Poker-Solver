/* Convergence on randomly drawn boards, with the same betting structure on every street.
   node sample.js <street> <structure> <n> <algos> <budget> [first] [last] -> out/sample_<street>_<structure>[_first-last].json

   Boards are drawn uniformly from the remaining deck with a fixed seed per street, so every board of the population
   (all flops, turns or rivers) is equally likely; for flops this is the same as drawing a strategically distinct flop
   with probability proportional to its orbit size. The S1 and S2 runs of a street use the same boards (paired design).
   Exploitability is evaluated every iteration up to 20 and then on a grid 5% apart; a count is the first checkpoint at
   or below the target, so it overstates the true first crossing by at most 5%. */
const { E, R, x, T, cards } = require('./spots.js'), { ALGOS } = require('./spots.js'), fs = require('fs');
const [street, structure, nArg, algosArg, budgetArg, firstArg, lastArg] = process.argv.slice(2);
const n = +nArg, budget = +budgetArg, algos = algosArg.split(','), first = +(firstArg || 0), last = +(lastArg || n);
const STRUCT = {
  S1: s => T([x([75]), x([75])], [x([75]), x([75])], [x([75]), x([75])], 2),                     // one size, no raises
  S2: s => T([x([33, 75], [50]), x([33, 75], [50])], [x([33, 75], [50]), x([33, 75], [50])],
             [x([33, 75], [50]), x([33, 75], [50])], 2),                                        // two sizes and a raise
};
const nb = { flop: 3, turn: 4, river: 5 }[street];
const pot = { river: 20, turn: 12, flop: 5.5 }[street], stack = { river: 87, turn: 91, flop: 97.5 }[street];
const seed = { flop: 1001, turn: 2002, river: 3003 }[street];
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const RANKS = '23456789TJQKA', SUITS = 'cdhs', deck = [];
for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
const rand = rng(seed), boards = [];
for (let i = 0; i < n; i++) {                       // partial Fisher-Yates: a uniform random set of nb cards
  const d = deck.slice();
  for (let k = 0; k < nb; k++) { const j = k + Math.floor(rand() * (d.length - k)); [d[k], d[j]] = [d[j], d[k]]; }
  boards.push(d.slice(0, nb).join(''));
}
const ranges = [E.parseRange(R.BB), E.parseRange(R.BTN)], tol = [1, 0.3, 0.1];
const suffix = firstArg ? `_${first}-${last}` : '';
const file = __dirname + `/out/sample_${street}_${structure}${suffix}.json`;
const res = [];
for (let bi = first; bi < last; bi++) {
  const b = boards[bi], g = E.buildGame({ board: cards(b), pot, stack, ranges, tree: STRUCT[structure](street) });
  const rec = { board: b, decisions: g.decisions.length, n: g.n, runs: {} };
  for (const a of algos) {
    const s = new E.Solver(g, ALGOS[a]), pts = [], hit = {}; let ms = 0;
    for (let k = 1; k <= budget; k = k < 20 ? k + 1 : Math.max(k + 1, Math.ceil(k * 1.05))) {
      const t0 = Date.now(); s.iterate(k - s.t); ms += Date.now() - t0;
      const e = s.evaluate().exploitPct; pts.push([k, e]);
      for (const t of tol) if (hit[t] == null && e <= t) hit[t] = k;
      if (e <= 0.1) break;
    }
    rec.runs[a] = { pts, hit, ms };
    console.log(street, structure, bi, b, a, 'decisions', g.decisions.length, 'to 1/0.3/0.1%:',
      tol.map(t => hit[t] ?? '>' + budget).join(' / '), 'ms', ms);
  }
  res.push(rec);
  fs.writeFileSync(file, JSON.stringify({ street, structure, pot, stack, seed, boards, res }));
}
console.log('done');
