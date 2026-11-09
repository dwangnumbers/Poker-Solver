"""Inside the prox-Newton finish: FB residual of each semismooth Newton iteration, per proximal step."""
import numpy as np, json, warnings
warnings.filterwarnings('ignore')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from games import leduc, river
from cfr import solve
from seqform import SeqForm, ProxNewtonFBReduced
from bench_river import SMALL
from fig_conv import C

def trace(g, warm, rho=1e-5, outer=8):
    T, R, S, h = solve(g, 'dcfr', iters=warm, log_every=warm)
    sf = SeqForm(g); pn = ProxNewtonFBReduced(sf); avg = T.normalize_avg(S)
    z = pn.warm_start(avg); segs = []; outer_res = [np.linalg.norm(pn.residual(z))]
    for k in range(outer):
        pn.inner_res = []
        z, ni = pn.inner(z.copy(), rho, z.copy())
        segs.append([r for r in pn.inner_res if r is not None])
        outer_res.append(np.linalg.norm(pn.residual(z)))
        if outer_res[-1] < 1e-13:
            break
    return segs, outer_res

if __name__ == '__main__':
    fig, axs = plt.subplots(1, 2, figsize=(6.4, 2.6), sharey=True)
    out = {}
    for ax, (name, g, warm) in zip(axs, (('Leduc', leduc(), 100), ('river (small)', river(**SMALL), 1000))):
        segs, orr = trace(g, warm)
        out[name] = dict(segs=segs, outer=orr)
        x0 = 0
        for i, s in enumerate(segs):
            xs = np.arange(x0, x0 + len(s))
            ax.semilogy(xs, s, color=C['ours'] if i % 2 == 0 else C['cfr'], lw=1.4, marker='o', ms=2.5)
            x0 += len(s)
        ends = np.cumsum([len(s) for s in segs]) - 1
        ax.semilogy(np.r_[0, ends], orr, color='#0b0b0b', lw=0, marker='s', ms=4, label='VI residual after each prox step')
        ax.set_title(f'{name} (warm start: DCFR, {warm} its)', fontsize=8.5)
        ax.set_xlabel('semismooth Newton iteration')
    axs[0].set_ylabel('residual')
    axs[0].legend(fontsize=7, loc='lower left')
    fig.tight_layout(); fig.savefig('../figs/newton_inner.pdf'); plt.close(fig)
    json.dump(out, open('../results/newton_inner.json', 'w'))
    for k, v in out.items():
        print(k, 'newton per prox step', [len(s) for s in v['segs']], 'outer', ['%.1e' % r for r in v['outer']])
