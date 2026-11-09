"""Baselines on the river spots: exploitability vs wall time."""
import numpy as np, time, json, sys, warnings
warnings.filterwarnings('ignore')
from games import river, BB_CALL, BTN_OPEN
from cfr import solve
SMALL = dict(ranges=['55+,A9s+,KTs+,QTs+,JTs,ATo+,KJo+', '77+,A8s+,K9s+,Q9s+,J9s+,T9s,98s,AJo+,KQo'],
             bet_sizes=(0.75,), raise_sizes=(1.0,), max_raises=1)
MEDIUM = dict(ranges=[BB_CALL, BTN_OPEN])
if __name__ == '__main__':
    which = sys.argv[1]; iters = int(sys.argv[2])
    algos = sys.argv[3].split(',') if len(sys.argv) > 3 else ['cfr+', 'dcfr', 'pcfr+']
    tag = sys.argv[4] if len(sys.argv) > 4 else ''
    g = river(**SMALL) if which == 'small' else (river() if which == 'full' else river(**MEDIUM))
    out = {}
    for algo in algos:
        t0 = time.time(); rec = []
        def cb(t, e):
            rec.append((t, time.time() - t0, float(e[1]), float(e[2])))
        T, R, S, h = solve(g, algo, iters=iters, log_every=max(iters // 60, 1), callback=cb)
        if tag:
            import pickle; pickle.dump(T.normalize_avg(S), open(f'../results/{which}_{algo}{tag}.pkl', 'wb'))
        out[algo] = rec
        print(algo, rec[-1], flush=True)
    json.dump(out, open(f'../results/baselines_river_{which}{tag}.json', 'w'))
