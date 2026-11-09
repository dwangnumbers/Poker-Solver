"""Convergence figures (exploitability vs iterations / wall time)."""
import json, os, numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams.update({'font.family': 'serif', 'font.size': 9, 'pdf.fonttype': 42, 'axes.spines.top': False,
                     'axes.spines.right': False, 'axes.edgecolor': '#52514e', 'axes.labelcolor': '#0b0b0b',
                     'xtick.color': '#52514e', 'ytick.color': '#52514e', 'axes.grid': True,
                     'grid.color': '#e4e3df', 'grid.linewidth': 0.6, 'legend.frameon': False})
C = {'cfr': '#2a78d6', 'cfr+': '#eb6834', 'dcfr': '#1baf7a', 'pcfr+': '#eda100', 'ours': '#e87ba4'}
LBL = {'cfr': 'CFR', 'cfr+': 'CFR$^+$', 'dcfr': 'DCFR', 'pcfr+': 'PCFR$^+$', 'ours': 'DCFR $\\to$ second-order finish (ours)'}
R = '../results/'
FIG = '../figs/'

def leduc_iters():
    d = json.load(open(R + 'baselines_leduc.json'))
    fig, ax = plt.subplots(figsize=(4.6, 2.9))
    for a in ('cfr', 'cfr+', 'dcfr', 'pcfr+'):
        h = np.array(d[a]['hist'])
        ax.loglog(h[:, 0], h[:, 1], color=C[a], lw=1.6, label=LBL[a])
    t = np.array([100, 5000])
    ax.loglog(t, 2.0 / np.sqrt(t), color='#52514e', lw=0.8, ls='--')
    ax.text(300, 2.0 / np.sqrt(300) * 1.3, r'$T^{-1/2}$', color='#52514e')
    ax.loglog(t, 60.0 / t ** 1.5, color='#52514e', lw=0.8, ls=':')
    ax.text(250, 60 / 250 ** 1.5 * 0.35, r'$T^{-3/2}$', color='#52514e')
    ax.set_xlabel('iterations $T$'); ax.set_ylabel('exploitability (chips/hand)')
    ax.legend(loc='lower left', fontsize=8)
    fig.tight_layout(); fig.savefig(FIG + 'conv_leduc_iters.pdf'); plt.close(fig)

def hybrid(game, base_file, newton_file, unit_scale=1.0, ylabel='exploitability (chips/hand)', xmax=None,
           lp_time=None, out=None, base_algos=('cfr+', 'dcfr', 'pcfr+'), label_ours=None):
    fig, ax = plt.subplots(figsize=(4.8, 3.0))
    d = json.load(open(R + base_file))
    for a in base_algos:
        if a not in d:
            continue
        if isinstance(d[a], dict):                        # {'hist': [(t, avg, last)], 'time': total}
            h = np.array(d[a]['hist']); tt = h[:, 0] * d[a]['time'] / h[-1, 0]; ee = h[:, 1]
        else:                                             # [(t, wall, avg, last)]
            h = np.array(d[a]); tt = h[:, 1]; ee = h[:, 2]
        ax.loglog(tt, ee * unit_scale, color=C[a], lw=1.6, label=LBL[a])
    if newton_file and os.path.exists(R + newton_file):
        runs = json.load(open(R + newton_file))
        for i, r in enumerate(runs):
            if 'points' in r:                                   # support-restricted finish: one point per round
                o = np.array([(t, e) for _, t, e in r['points']], dtype=float)
            else:
                o = np.array([(x[4], x[3]) for x in r['outer']], dtype=float)
            o[:, 1] = np.maximum(o[:, 1], 1e-16)
            ax.loglog(o[:, 0], o[:, 1] * unit_scale, color=C['ours'], lw=1.6, marker='o', ms=4,
                      label=(label_ours or LBL['ours']) if i == 0 else None)
    if lp_time is not None:
        ax.axvline(lp_time, color='#52514e', lw=0.8, ls=':')
        ax.text(lp_time * 1.1, ax.get_ylim()[1] * 0.3, 'exact LP\n(HiGHS)', color='#52514e', fontsize=7, va='top')
    ax.set_xlabel('wall time (s), one core'); ax.set_ylabel(ylabel)
    if xmax: ax.set_xlim(right=xmax)
    ax.legend(loc='lower left', fontsize=7.5)
    fig.tight_layout(); fig.savefig(FIG + out); plt.close(fig)

if __name__ == '__main__':
    leduc_iters()
    long = 'baselines_leduc_long.json' if os.path.exists(R + 'baselines_leduc_long.json') else 'baselines_leduc.json'
    hybrid('leduc', long, 'support_leduc.json', out='hybrid_leduc.pdf', lp_time=0.04, base_algos=('cfr+', 'dcfr'))
    hybrid('small', 'baselines_river_small.json', 'support_small.json', unit_scale=1.0,
           ylabel='exploitability (chips, pot = 100)', out='hybrid_small.pdf', lp_time=1.6)
    hybrid('medium', 'baselines_river_medium_combined.json', 'support_medium.json', unit_scale=1.0,
           ylabel='exploitability (chips, pot = 100)', out='hybrid_medium.pdf', base_algos=('cfr+', 'dcfr'))
    hybrid('medium', 'baselines_river_medium_combined.json', 'newton_medium.json', unit_scale=1.0,
           ylabel='exploitability (chips, pot = 100)', out='hybrid_medium_fullvi.pdf', base_algos=('cfr+', 'dcfr'),
           label_ours='DCFR $\\to$ full-VI finish')
