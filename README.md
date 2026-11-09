# Poker-Solver

A small, readable poker solver in Python, written for a one-hour talk at the Numerical Analysis Research Club
on the mathematics behind poker solvers. It adds a new idea: a **second-order "finish"** for the solve.

The solver has two parts:

1. **Range-vectorised CFR.** CFR, CFR⁺, DCFR and PCFR⁺ run on the public game tree with alternating updates.
   This is the first-order method that every practical poker solver is built on.
2. **A second-order finish.** We write the equilibrium conditions of the sequence form as a skew-monotone
   variational inequality and solve it with a proximal-point outer loop. The first subproblem is solved by an
   interior-point method followed by a crossover. Every later subproblem is solved by semismooth (primal–dual
   active-set) Newton steps. A few hundred DCFR iterations provide the warm start, both the primal (average
   strategies) and the dual (information-set values from one best-response pass).

The talk is in `tex/`: `talk.pdf` has the slides and `talk-notes.pdf` the speaker notes.

## The idea in one paragraph

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

CFR does the cheap global phase. The finish does the local phase, where CFR's average converges sublinearly.

## Results (one CPU core; exploitability in chips)

| game | first-order baseline | hybrid: DCFR warm start → finish | exact LP (HiGHS) |
|---|---|---|---|
| Leduc hold'em (964 unknowns) | CFR⁺: 9.2e-7 after 50 000 iterations (130 s) | **5.5e-14 in 0.33 s** (100 DCFR its + 19 linear solves) | 0.04 s |
| NLHE river, 147 vs 139 combos (2 864 unknowns) | DCFR: 5.4e-6 after 30 000 iterations (9 s) | **3.9e-14 in 1.9 s** (1000 DCFR its + 17 linear solves) | 1.6 s |
| NLHE river, 473 vs 328 combos (17 626 unknowns) | DCFR: **1.8e-6 after 100 000 iterations (282 s); 3.6e-7 after 190 000 (520 s)** | 3.2e-5 after 3 proximal steps (528 s); with ρ = 3e-4 and Anderson acceleration of the proximal map, 8.0e-7 at 480 s, then stalls | not finished after 25 min |

**Where it wins.** On small and mid-sized subgames the hybrid reaches machine-precision equilibria where CFR-type
methods would need millions of iterations. It also identifies the exact support of the equilibrium.

**Where it does not.** On the larger river spot CFR wins. The equilibrium there is far from unique, so the
regularised subproblems are ill-conditioned: `‖(M + ρI)⁻¹‖ ≈ 1/ρ`. The interior point's prediction of the active
set is then wrong, the crossover fails, and every proximal step falls back to a full interior-point solve. Each
factorisation takes about 8 s, which is thousands of CFR iterations. Making the finish scale is an open
linear-algebra and conditioning problem; the payoff blocks are semiseparable plus a sparse correction. See the last
slides of the talk.

**Closest prior work.** Yang, Gao, Lin & Kroer (arXiv:2512.12910, 2025) proposed a semismooth Newton method for
*matrix* games, warm-started by PRM⁺. This repository works directly on the *sequence form* of extensive-form
poker and uses a different regularisation and dual warm start.

## Layout

```
solver/
  games.py        Kuhn, Leduc, heads-up no-limit river builder (7-card evaluator, card removal, range notation)
  cfr.py          range-vectorised public-tree CFR / CFR+ / DCFR / PCFR+, best response, exploitability
  seqform.py      sequence form (E, F, A), dual estimates, Newton-type finishes:
                    ProxIPMPDAS           <- the method of the talk (prox point; IPM + crossover; active-set Newton)
                    ProxNewtonQD          prox point + Fischer-Burmeister semismooth Newton, quasi-definite LDLᵀ
                    ProxNewtonFB(Reduced) same iterates as ProxNewtonQD, unsymmetric sparse LU
                    ProxAAPDAS            Anderson-accelerated proximal map (helps the outer loop; stalls on the medium spot)
                    purify, fb_scaling, ProxSmoothNewtonQD, ProxIPMNewton   experiments
                    ProxNewton            min-function (primal-dual active set) variant
                    NewtonFinish, SmoothingNewton, crossover   earlier attempts (do not work on Leduc)
  lp.py           exact sequence-form LP via HiGHS (reference)
  aa.py, maps.py  Anderson acceleration of the CFR+ map (negative result)
  extrap.py       reduced-rank extrapolation of CFR averages (negative result)
  demo.py         two-second live demo (small river spot)
  test_solver.py  sanity tests: hand evaluator, ranges, Kuhn value -1/18, finish = LP value on Leduc and a river spot
  bench_*.py      benchmarks -> results/*.json
  fig_*.py        figures    -> figs/*.pdf
  gen_numbers.py  results -> tex/numbers.tex (every computed number quoted on the slides)
results/          benchmark outputs
figs/             figures used in the talk
tex/              talk.tex, talk.pdf, talk-notes.pdf
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
python3 bench_newton.py leduc 100 300 1000             # hybrid solver
python3 bench_newton.py small 300 1000 3000
python3 bench_newton.py medium 1000                    # slow: minutes per proximal step (our run was stopped after 3); CFR wins here
python3 bench_river.py medium 100000 dcfr,cfr+ _long
python3 solve_spot.py 5000                             # strategy of the medium spot for the grids
python3 fig_conv.py; python3 fig_poker.py; python3 fig_newton.py; python3 fig_rm.py
python3 gen_numbers.py
cd ../tex && pdflatex talk.tex && pdflatex talk.tex
pdflatex -jobname=talk-notes "\def\notesmode{1}\input{talk.tex}"
```

Live demo for the talk (about 2 seconds): `python3 solver/demo.py` solves the small river spot with DCFR and the
finish, printing exploitability after every step and the big blind's strategy for a few hands.

A minimal use of the solver:

```python
from games import river, BB_CALL, BTN_OPEN
from cfr import solve
from seqform import SeqForm, ProxIPMPDAS

g = river(board=('Ks', '7d', '2c', 'Th', '4s'), ranges=[BB_CALL, BTN_OPEN])
T, R, S, hist = solve(g, 'dcfr', iters=1000, log_every=1000)       # first-order phase
sigma, z, finish_hist = ProxIPMPDAS(SeqForm(g)).solve(T.normalize_avg(S), rho=1e-5)   # second-order finish
```

## References

The main references are listed on the last slides of the talk. They include Zinkevich et al. 2007 (CFR),
Tammelin 2014 (CFR⁺), Brown & Sandholm 2019 (DCFR), Farina, Kroer & Sandholm 2021 (PCFR⁺),
von Stengel 1996 (sequence form), Rockafellar 1976 (proximal point), Hintermüller, Ito & Kunisch 2002
(the active-set method as semismooth Newton), Mehrotra 1992 (predictor–corrector interior point), Fischer 1992 and
De Luca, Facchinei & Kanzow 1996 (Fischer–Burmeister semismooth Newton), Vanderbei 1995 (quasi-definite
matrices), and Johanson et al. 2011 (fast best response).
