"""Live demo for the talk (about 2 seconds): solve a river spot with DCFR, then the second-order finish,
and print what a few hands do.

    python3 demo.py                 # small spot
    python3 demo.py KcJd            # also show this hand (big blind's first action)
"""
import sys, time, warnings
import numpy as np
warnings.filterwarnings('ignore')
from games import river
from cfr import solve
from seqform import SeqForm
from support import solve_support
from bench_river import SMALL

g = river(**SMALL)
print(f'{g.name}: big blind {g.nh[0]} combos vs button {g.nh[1]} combos, pot 100, stacks 100')
t0 = time.time()
T, R, S, hist = solve(g, 'dcfr', iters=1000, log_every=250,
                      callback=lambda t, h: print(f'  DCFR {t:5d} iterations   exploitability {h[1]:.2e} chips'))
t1 = time.time()
sf = SeqForm(g)
print('restrict to the predicted support, solve exactly, verify:')
sigma, info = solve_support(sf, T.normalize_avg(S), tau=1e-3, verbose=False)
t2 = time.time()
for r in info:
    print(f"  round {r['round']}: {r['n_vars']} unknowns, {r['solves']:2d} linear solves, "
          f"full-game exploitability {r['expl']:.2e} chips, {r['added']} actions added back")
print(f'DCFR {t1 - t0:.1f}s, finish {t2 - t1:.1f}s;  game value for the big blind: {sf.T.game_value(sigma):+.10f} chips')

root = g.decisions[0]
show = ['TcTd', '7h7c', 'AhKd', 'KhQh', 'AsQs', 'JcTc', 'QsJs'] + sys.argv[1:]
labels = g.hand_labels[0]
print(f'\nBig blind, first action  ({", ".join(root.actions)}):')
for h in show:
    cands = [i for i, l in enumerate(labels) if l == h or l == h[2:] + h[:2]]
    if not cands:
        print(f'  {h}: not in range'); continue
    p = sigma[0][cands[0]]
    print(f'  {h}: ' + '  '.join(f'{a} {q:6.1%}' for a, q in zip(root.actions, p)))
