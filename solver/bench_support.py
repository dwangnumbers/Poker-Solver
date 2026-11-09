"""Benchmark of the support-restricted finish: DCFR warm start -> prune -> exact restricted solve -> verify -> repeat."""
import numpy as np, time, json, sys, warnings
warnings.filterwarnings('ignore')
from games import river, leduc
from cfr import solve
from seqform import SeqForm
from support import solve_support
from bench_river import SMALL, MEDIUM

if __name__ == '__main__':
    which = sys.argv[1]; tau = float(sys.argv[2]); warms = [int(a) for a in sys.argv[3:]]
    g = {'leduc': leduc, 'small': lambda: river(**SMALL), 'medium': lambda: river(**MEDIUM), 'full': river}[which]()
    sf = SeqForm(g)
    out = []
    for w in warms:
        t0 = time.time(); T, R, S, h = solve(g, 'dcfr', iters=w, log_every=w); tw = time.time() - t0
        sigma, info = solve_support(sf, T.normalize_avg(S), tau=tau, verbose=(which in ('medium', 'full')))
        pts = [(0, tw, float(h[-1][1]))] + [(i['round'] + 1, tw + i['total'], i['expl']) for i in info]
        out.append(dict(warm=w, tau=tau, warm_time=tw, warm_expl=float(h[-1][1]), points=pts, rounds=info,
                        value=float(sf.T.game_value(sigma))))
        print(which, w, [(round(t, 2), f'{e:.1e}') for _, t, e in pts], flush=True)
    json.dump(out, open(f'../results/support_{which}.json', 'w'))
