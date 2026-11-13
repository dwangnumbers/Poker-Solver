# Speaking notes for the live demonstration

These notes go with the site in `docs/` (published with GitHub Pages from the `main` branch, `/docs` folder) and with
the slide "Demonstration" of `tex/talk.tex`. The demonstration takes about ten minutes. A five minute version is at
the end. The older single-street river table is the **Talk demo** tab; its own notes are in `RIVER_DEMO_NOTES.md`.

Numbers below are what the site shows on a laptop with eight cores. A solve stops at a finite accuracy, so the last
digit on your screen can differ.

## Before the talk

1. Open the site and check that all five tabs load: Postflop, Preflop and multiway, Flop reports, Talk demo and
   Methods. The preflop page downloads about 2 MB of equity tables the first time.
2. On the Postflop page the example spot "Single-raised pot, button vs big blind, K72 rainbow" is already loaded
   with the tree "One size per street (fast)". The line under the tree reads about 57,000 decision nodes and 431 MB.
3. Leave **Threads** at the number of cores of the laptop. Close other heavy tabs; the solve uses all cores.
4. Zoom the browser so that the solver panel and the strategy browser are both visible.

## Step 1. Build and solve a flop (2 minutes)

**Do.** Press **Build and solve**.

**Say.** "This is the most common spot in online poker: the button opened, the big blind called, and the flop is king,
seven, two of three suits. The big blind has 488 hands, the button 460. The tree has one bet size per street, and it
still has fifty-seven thousand decision nodes, because every turn card and every river card opens a new copy of the
later streets. The memory estimate is computed before building: eight bytes per hand and action."

**Point at.** The worker count next to the Solver title, then the exploitability curve on its log scale with the
dashed target line at 0.3% of the pot. Each point is a full best-response computation in both directions.

**The math.** Exploitability is the duality gap of the saddle-point problem. The curve is the convergence slide of
the talk happening live; DCFR needs a few hundred iterations for 0.3% of the pot.

## Step 2. Browse the solution (2 minutes)

**Do.** When the solve stops, the browser opens at the root. In this tree the big blind has no flop bet, so the
first decision is the button's. Read the action buttons, then click **check**. A card picker appears: click the
five of spades.

**Say.** "After a check the turn card is dealt. Every turn card has its own solution, because the tree below a
chance node is copied for each card. Here is the big blind's turn strategy on the five."

**Point at.** The grid colours (green check, red bet), then switch the view to **EV** and to **Equity**. Point at one
square and read the combination table on the right: weight, strategy, EV in chips and equity of each of its
combinations. Mention that the grid is aggregated by class, while the solver works with the individual combinations.

## Step 3. Lock a node (2 minutes)

**Do.** Open **Node locking** under the grid. Press **Edit and lock**, choose the bet action, set the frequency to
100% and paint a row of medium hands. Press **Lock this strategy**, then **Continue**.

**Say.** "Locking fixes this strategy and re-solves everything else. The question it answers is how the button
should adjust to a big blind who bets too often with medium hands."

**Point at.** The locked tag, the exploitability that rises and falls again during the re-solve, and the button's
response at the next node (more raises and more calls).

**The math.** The solver now computes an equilibrium of the restricted game in which the locked node is fixed. Its
regrets are not updated, and best responses do not optimise over it.

## Step 4. Preflop (2 minutes)

**Do.** Open **Preflop and multiway**. The preset is heads-up push or fold at 10 big blinds. Press **Build and
solve**.

**Say.** "Preflop, strategies are per hand class, 169 of them. With only shove or fold the game is small and the
solver converges in a second. The small blind shoves 58% of hands and the big blind calls 37%. These are the
published Nash push-or-fold numbers, and a linear program on the same equity tables gives the same values to five
digits."

**Do.** Choose the preset **Six-max, 20 bb, with antes** and solve. Show the **First-in ranges** table.

**Say.** "With six players there is no equilibrium guarantee. The page reports NashConv, the total gain available
to the players by deviating, and it decreases but slowly."

## Step 5. Flop reports, if time allows (1 minute)

**Do.** Open **Flop reports**. Set the flop set to 25 flops and press **Run report**.

**Say.** "Up to suit permutations there are 1,755 different flops. A report solves the same spot on a weighted,
stratified subset and averages. Each flop takes a few seconds with the later streets checked down."

## Five minute version

Steps 1 and 2 only, with the turn card chosen in advance, then the preflop push-or-fold solve.

## Questions that the demonstration tends to raise

- **Why so slow compared with commercial solvers?** The engine is plain JavaScript. Native solvers use vector
  instructions, suit isomorphism and pruning; these are on the next-steps slide.
- **Why does the grid show fractions of a hand?** A square is a class of combinations, and card removal by the board
  and by the line makes some combinations impossible or less likely.
- **Is the six-player solution an equilibrium?** Not guaranteed. The measured NashConv says how far from one.
- **Where does the time go?** About two thirds in the decision nodes (regret updates) and one third in the leaves.
