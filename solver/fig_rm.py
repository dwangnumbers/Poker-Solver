"""Regret matching in self-play on a weighted rock-paper-scissors game: last iterate cycles, average converges.
Also: CFR+ average vs last iterate on Leduc."""
import numpy as np, json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from fig_conv import C, LBL

A = np.array([[0., -1., 2.], [1., 0., -1.], [-2., 1., 0.]])     # row player's payoff (zero-sum, symmetric game)
def rm(T=3000):
    R1 = np.zeros(3); R2 = np.zeros(3); S1 = np.zeros(3)
    xs, avg = [], []
    x = np.array([0.8, 0.1, 0.1]); y = np.array([0.1, 0.1, 0.8])
    R1 = np.array([1.0, 0, 0]); R2 = np.array([0, 0, 1.0])
    for t in range(1, T + 1):
        x = np.maximum(R1, 0); x = x / x.sum() if x.sum() > 0 else np.ones(3) / 3
        y = np.maximum(R2, 0); y = y / y.sum() if y.sum() > 0 else np.ones(3) / 3
        u1 = A @ y; u2 = -A.T @ x
        R1 += u1 - x @ u1; R2 += u2 - y @ u2
        S1 += x; xs.append(x.copy()); avg.append(S1 / t)
    return np.array(xs), np.array(avg)

def bary(p):
    return p[:, 1] + 0.5 * p[:, 2], np.sqrt(3) / 2 * p[:, 2]

if __name__ == '__main__':
    xs, avg = rm()
    # equilibrium of this game: solve A^T x = v 1 restricted ... (symmetric zero-sum => value 0): A x* = 0
    from scipy.linalg import null_space
    xe = null_space(A)[:, 0]; xe = xe / xe.sum()
    fig, ax = plt.subplots(figsize=(3.2, 2.9))
    tri = np.array([[0, 0], [1, 0], [0.5, np.sqrt(3) / 2], [0, 0]])
    ax.plot(tri[:, 0], tri[:, 1], color='#52514e', lw=0.8)
    for (px, py), lab in zip(tri[:3], ['rock', 'paper', 'scissors']):
        ax.text(px, py + (0.05 if lab == 'scissors' else -0.08), lab, ha='center', fontsize=8, color='#52514e')
    bx, by = bary(xs[:300]); ax.plot(bx, by, color=C['cfr'], lw=0.7, alpha=0.8, label='current strategy $\\sigma_t$')
    ax_, ay_ = bary(avg); ax.plot(ax_, ay_, color=C['cfr+'], lw=1.8, label='average $\\bar\\sigma_t$')
    ex, ey = bary(xe[None, :]); ax.plot(ex, ey, 'o', color='#0b0b0b', ms=5, label='equilibrium')
    ax.set_aspect('equal'); ax.axis('off'); ax.legend(fontsize=7, loc='upper center', bbox_to_anchor=(0.5, 0.0), ncol=1, frameon=False)
    fig.tight_layout(); fig.savefig('../figs/rm_rps.pdf'); plt.close(fig)
    print('equilibrium', xe, 'final avg', avg[-1])
    # Leduc: average vs last iterate
    d = json.load(open('../results/baselines_leduc.json'))
    fig, ax = plt.subplots(figsize=(3.6, 2.6))
    for a in ('cfr+', 'dcfr'):
        h = np.array(d[a]['hist'])
        ax.loglog(h[:, 0], h[:, 1], color=C[a], lw=1.6, label=LBL[a] + ' average')
        ax.loglog(h[:, 0], h[:, 2], color=C[a], lw=1.0, ls='--', label=LBL[a] + ' last iterate')
    ax.set_xlabel('iterations'); ax.set_ylabel('exploitability'); ax.legend(fontsize=7, frameon=False)
    ax.grid(True, color='#e4e3df', lw=0.6); ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout(); fig.savefig('../figs/avg_vs_last.pdf'); plt.close(fig)
