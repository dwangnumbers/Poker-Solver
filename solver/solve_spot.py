"""Solve the medium river spot and save the strategy (for the poker figures).
    python3 solve_spot.py 5000          # DCFR only
    python3 solve_spot.py 3000 exact    # DCFR + restricted second-order finish (exploitability ~1e-12)"""
import numpy as np, pickle, sys
from games import river, BB_CALL, BTN_OPEN
from cfr import solve
iters = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
exact = len(sys.argv) > 2 and sys.argv[2] == 'exact'
g = river(ranges=[BB_CALL, BTN_OPEN])
T, R, S, h = solve(g, 'dcfr', iters=iters, log_every=iters)
avg = T.normalize_avg(S)
expl = h[-1][1]
if exact:
    from seqform import SeqForm
    from support import solve_support
    sf = SeqForm(g)
    avg, info = solve_support(sf, avg, tau=1e-3, verbose=False)
    expl = sf.T.exploitability(avg)
print('exploitability (chips, pot=100):', expl)
pickle.dump(dict(sigma=avg, expl=expl, iters=iters, exact=exact), open('../results/medium_solution.pkl', 'wb'))
