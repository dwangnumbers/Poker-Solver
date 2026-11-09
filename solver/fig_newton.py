"""Inside the finish: VI residual after every linear solve (interior-point phase, then active-set Newton steps)."""
import numpy as np, json, warnings
warnings.filterwarnings('ignore')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from games import leduc, river
from cfr import solve
from seqform import SeqForm, ProxIPMPDAS
from bench_river import SMALL
from fig_conv import C

def trace(g, warm, rho=1e-5):
    T, R, S, h = solve(g, 'dcfr', iters=warm, log_every=warm)
    sf = SeqForm(g); pn = ProxIPMPDAS(sf); avg = T.normalize_avg(S)
    pn.trace = [('start', float(np.linalg.norm(pn.residual(pn.warm_start(avg)))))]
    pn.solve(avg, rho=rho, outer=30, track=False)
    return pn.trace, pn.log

if __name__ == '__main__':
    fig, axs = plt.subplots(1, 2, figsize=(6.4, 2.5), sharey=True)
    out = {}
    for ax, (name, g, warm) in zip(axs, (('Leduc', leduc(), 100), ('river (small)', river(**SMALL), 1000))):
        tr, log = trace(g, warm)
        out[name] = dict(trace=tr, log=[list(map(str, l)) for l in log])
        res = np.array([max(r, 1e-16) for _, r in tr]); kind = [k for k, _ in tr]
        x = np.arange(len(res))
        ax.semilogy(x, res, color='#c3c2b7', lw=1.0, zorder=1)
        for k, col, lab in (('ipm', C['cfr'], 'interior-point step (first prox step)'), ('pdas', C['ours'], 'active-set Newton step')):
            sel = np.array([kk == k for kk in kind])
            ax.semilogy(x[sel], res[sel], 'o', color=col, ms=4, label=lab, zorder=2)
        ax.semilogy([0], res[:1], 's', color='#0b0b0b', ms=4, label='DCFR warm start')
        ax.set_title(f'{name} (DCFR {warm} its, then finish)', fontsize=8.5)
        ax.set_xlabel('linear solves')
        print(name, 'solves', len(res) - 1, 'final', res[-1], 'ipm', kind.count('ipm'), 'pdas', kind.count('pdas'))
    axs[0].set_ylabel('VI residual')
    axs[0].legend(fontsize=6.5, loc='lower left')
    for ax in axs: ax.grid(True, color='#e4e3df', lw=0.6); ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout(); fig.savefig('../figs/newton_inner.pdf'); plt.close(fig)
    json.dump(out, open('../results/newton_inner.json', 'w'))
