import sys, json, time
from games import kuhn, leduc
from cfr import solve
gname, iters = sys.argv[1], int(sys.argv[2])
g = {'kuhn': kuhn, 'leduc': leduc}[gname]()
out = {}
for algo in (sys.argv[3].split(',') if len(sys.argv) > 3 else ['cfr', 'cfr+', 'dcfr', 'pcfr+']):
    t0 = time.time()
    T, R, S, h = solve(g, algo, iters=iters, log_every=max(1, iters // 100))
    out[algo] = {'hist': h, 'time': time.time() - t0}
    print(algo, h[-1], f'{time.time()-t0:.0f}s', flush=True)
json.dump(out, open(f'../results/baselines_{gname}' + (sys.argv[4] if len(sys.argv) > 4 else '') + '.json', 'w'))
