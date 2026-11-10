# Poker-Solver

A small, readable poker solver in Python, written for a one-hour talk at the Numerical Analysis Research Club
on the mathematics behind poker solvers. It adds a new idea: a **second-order "finish"** for the solve.

The solver has two parts:

1. **Range-vectorised CFR.** CFR, CFR⁺, DCFR and PCFR⁺ run on the public game tree with alternating updates.
   This is the first-order method that every practical poker solver is built on.
2. **A second-order finish.** The finish works in four steps:
   - Take the support predicted by a few thousand DCFR iterations.
   - Restrict the game to the actions in that support and to the positions both players can reach with them.
   - Solve the restricted sequence-form equilibrium conditions exactly, as a skew-monotone variational inequality.
     The solver is a proximal-point loop with an interior-point crossover and semismooth (active-set) Newton steps.
   - Verify the result in the full game with exact best responses. Add back any profitable pruned action, and
     repeat.

The talk is in `tex/`: `talk.pdf` has the slides and `talk-notes.pdf` the speaker notes. A longer version of the
deck, with every citation and the extra technical slides, is `talk-detailed.pdf`.

## Interactive demonstration

`app/poker-solver.html` is a single self-contained page. Open it in any browser; it needs no server and no network.
It shows a river hand on a poker table and solves it live:

- **The table.** Click a board card to change it, click a player's cards to choose a hand, and click the action
  buttons to play the hand. The pot, the stacks and the bets follow along.
- **Range grids.** One tab for each player. For the player to act, every hand is coloured by action, with a
  separate colour for each bet size. For the other player, the grid shows how much of each hand is still in the
  range. Click a square to see the strategy and the value of each individual hand. Ranges can be painted or typed.
- **Game tree.** The public betting tree with the solved frequency on every branch. It follows the hand as it is
  played, and any point can be clicked.
- **Algorithm comparison.** CFR, CFR⁺, DCFR and PCFR⁺ race on the spot you set up, and their exploitability is
  plotted against iterations.

The solver core is `app/src/solver.js`, a JavaScript port of `solver/cfr.py` with an O(n) evaluation of each leaf
(sorted running sums with a card-removal correction). On the talk example it agrees with the Python solver: after
5 000 DCFR iterations both report an exploitability of 1.34e-4 chips. One iteration takes about a millisecond.

`app/DEMO_NOTES.md` (also as a PDF) has the speaking notes for a twelve minute demonstration, and the same steps are
built into the page under **Demo guide**. To rebuild the page after editing `app/src/`, run `python3 app/build.py`.

## The idea

With realisation plans `x, y`, information-set values `p, q`, and the sequence-form matrices `E, F, A`, a Nash
equilibrium is a solution of

```
0 <= x  ⟂  Eᵀp − A y >= 0,     E x = e,
0 <= y  ⟂  Aᵀx − Fᵀq >= 0,     F y = f,
```

This is a variational inequality `w = M z + b` whose matrix `M` is **skew** (`M + Mᵀ = 0`). It is monotone, and
its solution set is a polyhedron, generally not a point.

- A proximal term `ρ(z − zᵏ)` makes each subproblem strongly monotone. The outer loop then converges linearly,
  gaining about three digits per step at `ρ = 1e-5`.
- Each subproblem is the piecewise-linear equation `min(x, w) = 0`. A semismooth Newton step on it fixes the active
  set (the dropped actions) and solves one linear system, which is the primal–dual active-set method. Every such
  matrix `D_a + D_b (M + ρI)` is nonsingular, by a one-line proof: `dᵀ(M + ρI)d = ρ‖d‖²`.
- The first subproblem needs the most active-set changes. A Mehrotra interior-point method solves it, and its point
  predicts the active set. The active-set Newton steps then land exactly on the solution: a **crossover**, as in LP
  solvers. Every later proximal step costs 1–3 linear solves.
- After the rows are scaled and half of them change sign, the interior-point systems become symmetric
  **quasi-definite**. An `LDLᵀ` factorisation therefore exists for any fill-reducing ordering (Vanderbei 1995).

- **Restrict, then verify.** The equilibrium set is *flat* in two kinds of direction: actions that are never played,
  and positions the opponent never lets you reach. Flatness makes the full problem ill-conditioned,
  `‖(M + ρI)⁻¹‖ ≈ 1/ρ`, so a small residual can still be far from the solution. Restricting to the CFR-predicted
  support removes those directions. Verification by exact best responses in the full game, a column-generation /
  double-oracle step, certifies the final exploitability.

CFR does the cheap global phase. The finish does the local phase, where CFR's average converges sublinearly.

## Results (one CPU core; exploitability in chips)

| game | first-order baseline | ours: DCFR warm start → restricted second-order finish | exact LP (HiGHS) |
|---|---|---|---|
| Leduc hold'em (964 unknowns) | CFR⁺: 9.2e-7 after 50 000 iterations (130 s) | **6.8e-14 in 0.30 s** (100 DCFR its, 2 rounds) | 0.04 s |
| NLHE river, 147 vs 139 combos (2 864 unknowns) | DCFR: 5.4e-6 after 30 000 iterations (9 s) | **1.1e-12 in 0.95 s** (1 000 DCFR its, 1 round) | 1.6 s |
| NLHE river, 473 vs 328 combos (17 626 unknowns) | DCFR: 3.9e-6 at 131 s; 3.6e-7 after 190 000 iterations (520 s) | **2.8e-12 in 131 s** (3 000 DCFR its, 3 rounds, 34% of the unknowns) | not finished after 25 min |
| NLHE river, full 1 081 vs 1 081 combos (47 568 unknowns) | **DCFR: 9.5e-6 after 40 000 iterations (574 s)** | 4.1e-6 after 2 rounds, 317 linear solves of a ~20 300-unknown system, 80 min (CFR wins) | – |

On the larger spot, the finish *without* the restriction loses to DCFR. It gets 3.2e-5 after 528 s because the
interior point predicts a wrong active set in the flat directions. Anderson acceleration of the proximal map helps
(8.0e-7 at 480 s with ρ = 3e-4) and then stalls. The restriction is what makes the method work at this size.

**Where it wins.** It reaches machine-precision equilibria, with a certificate, in seconds to minutes. CFR-type
methods would need millions of iterations for the same accuracy. It also identifies the exact support of the
equilibrium.

**Limits.** Each Newton-type step is a sparse factorisation of a matrix with dense hand-by-hand payoff blocks. With
full 1 081-combo ranges one factorisation takes about 10 s, and CFR wins. For the usual practical target of about
0.1% of the pot, DCFR alone is enough. Full ranges and multi-street trees would need structured linear algebra; the
payoff blocks are semiseparable plus a sparse correction. See the last slides of the talk.

**Closest prior work.** Yang, Gao, Lin & Kroer (arXiv:2512.12910, 2025) proposed a semismooth Newton method for
*matrix* games, warm-started by PRM⁺. This repository works directly on the *sequence form* of extensive-form
poker and uses a different regularisation and dual warm start. It also adds the support restriction with
verification; the verification is in the spirit of double-oracle methods (McMahan et al. 2003; Bošanský et al. 2014).

## Layout

```
solver/
  games.py        Kuhn, Leduc, heads-up no-limit river builder (7-card evaluator, card removal, range notation)
  cfr.py          range-vectorised public-tree CFR / CFR+ / DCFR / PCFR+, best response, exploitability
  support.py      the full method: predicted support -> restricted exact solve -> verification rounds
  seqform.py      sequence form (E, F, A), dual estimates, Newton-type finishes:
                    ProxIPMPDAS           <- exact solver used by support.py (prox point; IPM + crossover; active-set Newton)
                    ProxNewtonQD          prox point + Fischer-Burmeister semismooth Newton, quasi-definite LDLᵀ
                    ProxNewtonFB(Reduced) same iterates as ProxNewtonQD, unsymmetric sparse LU
                    ProxAAPDAS            Anderson-accelerated proximal map (helps the outer loop; stalls on the medium spot)
                    purify, fb_scaling, ProxSmoothNewtonQD, ProxIPMNewton   experiments
                    ProxNewton            min-function (primal-dual active set) variant
                    NewtonFinish, SmoothingNewton, crossover   earlier attempts (do not work on Leduc)
  lp.py           exact sequence-form LP via HiGHS (reference)
  aa.py, maps.py  Anderson acceleration of the CFR+ map (negative result)
  extrap.py       reduced-rank extrapolation of CFR averages (negative result)
  demo.py         one-second live demo (small river spot)
  test_solver.py  sanity tests: hand evaluator, ranges, Kuhn value -1/18, finish = LP value on Leduc and a river spot
  bench_*.py      benchmarks -> results/*.json
  fig_*.py        figures    -> figs/*.pdf
  gen_numbers.py  results -> tex/numbers.tex (every computed number quoted on the slides)
results/          benchmark outputs
figs/             figures used in the talk
tex/              talk.tex, talk.pdf, talk-notes.pdf (the deck used with the live demonstration)
                  talk-detailed.tex and its PDFs (longer version with all citations)
app/              poker-solver.html (the interactive page), DEMO_NOTES.md, build.py
  src/            solver.js (CFR core), app.js (interface), style.css, body.html
```

## Reproduce

```bash
pip install numpy scipy matplotlib qdldl
cd solver
python3 test_solver.py                                 # ~10 s
python3 bench_baselines.py leduc 5000                  # CFR, CFR+, DCFR, PCFR+ on Leduc
python3 bench_baselines.py leduc 50000 cfr+,dcfr _long
python3 bench_river.py small 30000                     # baselines on the small river spot
python3 bench_river.py medium 5000
python3 bench_support.py leduc 1e-3 100 300 1000       # the method of the talk
python3 bench_support.py small 1e-3 300 1000 3000
python3 bench_support.py medium 1e-3 1000 3000          # ~2.5 min each
python3 bench_support.py full 1e-3 3000                 # slow: ~80 min
python3 bench_river.py full 40000 dcfr
python3 bench_newton.py leduc 100 300 1000             # finish on the full (unrestricted) VI
python3 bench_newton.py small 300 1000 3000
python3 bench_newton.py medium 1000                    # slow: minutes per proximal step (our run was stopped after 3); CFR wins here
python3 bench_river.py medium 100000 dcfr,cfr+ _long
python3 solve_spot.py 3000 exact                       # exact equilibrium of the medium spot for the grids
python3 bench_river.py medium 190000 dcfr _long2
python3 fig_conv.py; python3 fig_poker.py; python3 fig_newton.py; python3 fig_rm.py; python3 fig_ranges.py
python3 gen_numbers.py
cd ../tex && pdflatex talk.tex && pdflatex talk.tex
pdflatex -jobname=talk-notes "\def\notesmode{1}\input{talk.tex}"
```

Live demo for the talk (about 1 second): `python3 solver/demo.py` solves the small river spot with DCFR and then
the finish. It prints the exploitability along the way and the big blind's strategy for a few hands.

A minimal use of the solver:

```python
from games import river, BB_CALL, BTN_OPEN
from cfr import solve
from seqform import SeqForm
from support import solve_support

g = river(board=('Ks', '7d', '2c', 'Th', '4s'), ranges=[BB_CALL, BTN_OPEN])
T, R, S, hist = solve(g, 'dcfr', iters=3000, log_every=3000)        # first-order phase
sf = SeqForm(g)
sigma, rounds = solve_support(sf, T.normalize_avg(S), tau=1e-3)      # restrict, solve exactly, verify
print(sf.T.exploitability(sigma))                                     # ~1e-12 chips
```

## References

The main references are listed on the last slides of the talk. They include Zinkevich et al. 2007 (CFR),
Tammelin 2014 (CFR⁺), Brown & Sandholm 2019 (DCFR), Farina, Kroer & Sandholm 2021 (PCFR⁺),
von Stengel 1996 (sequence form), Rockafellar 1976 (proximal point), Hintermüller, Ito & Kunisch 2002
(the active-set method as semismooth Newton), Mehrotra 1992 (predictor–corrector interior point), Fischer 1992 and
De Luca, Facchinei & Kanzow 1996 (Fischer–Burmeister semismooth Newton), Vanderbei 1995 (quasi-definite
matrices), McMahan, Gordon & Blum 2003 and Bošanský et al. 2014 (double oracle), and Johanson et al. 2011
(fast best response).
