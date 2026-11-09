"""Solve the medium river spot with DCFR and save the strategy (for the poker figures)."""
import numpy as np, pickle, sys
from games import river, BB_CALL, BTN_OPEN
from cfr import solve
iters = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
g = river(ranges=[BB_CALL, BTN_OPEN])
T, R, S, h = solve(g, 'dcfr', iters=iters, log_every=iters)
avg = T.normalize_avg(S)
print('exploitability (chips, pot=100):', h[-1][1])
pickle.dump(dict(sigma=avg, expl=h[-1][1], iters=iters), open('../results/medium_solution.pkl', 'wb'))
