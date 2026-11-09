"""Hybrid solver: DCFR warm start (k iterations) -> proximal semismooth Newton finish.
Records exploitability against compute time (exploitability evaluations excluded)."""
import numpy as np, time, json, sys, warnings
warnings.filterwarnings('ignore')
from games import river, leduc
from cfr import solve
from seqform import SeqForm, ProxNewtonFBReduced, ProxNewtonQD, ProxIPMNewton, ProxIPMPDAS
from bench_river import SMALL, MEDIUM

def run(g, warm, rho=1e-5, outer=25, verbose=False):
    t0 = time.time()
    T, R, S, h = solve(g, 'dcfr', iters=warm, log_every=warm)
    tw = time.time() - t0
    sf = SeqForm(g)
    pn = ProxIPMPDAS(sf); pn.steps = []; pn.sizes = []
    avg = T.normalize_avg(S)
    s2, z, hist = pn.solve(avg, rho=rho, outer=outer, verbose=verbose)
    return dict(warm=warm, warm_time=tw, warm_expl=float(h[-1][1]), rho=rho,
                outer=[(k, nt, float(r), float(e), tw + c) for (k, nt, r, e), c in zip(hist, pn.clock)],
                newton_steps=hist[-1][1], sizes=pn.sizes, steps=pn.steps, N=pn.N,
                ipm_iters=pn.ipm_iters, method=type(pn).__name__, log=pn.log)

if __name__ == '__main__':
    which = sys.argv[1]
    g = {'leduc': leduc, 'small': lambda: river(**SMALL), 'medium': lambda: river(**MEDIUM)}[which]()
    warms = [int(a) for a in sys.argv[2:]] or [200, 1000, 3000]
    out = []
    for w in warms:
        r = run(g, w, verbose=(which == 'medium')); out.append(r)
        print(which, w, r['warm_expl'], [(round(o[4], 2), o[3]) for o in r['outer']], flush=True)
    json.dump(out, open(f'../results/newton_{which}.json', 'w'))
