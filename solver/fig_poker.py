"""Poker figures from the medium river solution: 13x13 strategy grids and the pot-odds check."""
import numpy as np, pickle
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from games import river, BB_CALL, BTN_OPEN, RANKS, hand_class

plt.rcParams.update({'font.family': 'serif', 'font.size': 9, 'pdf.fonttype': 42})
g = river(ranges=[BB_CALL, BTN_OPEN])
sol = pickle.load(open('../results/medium_solution.pkl', 'rb'))
sigma = sol['sigma']
COL = {'check': '#3a9a6b', 'call': '#3a9a6b', 'fold': '#4a78b5',
       'bet0.33': '#f2a07b', 'bet0.75': '#d9573f', 'allin': '#8c1c24'}
NAME = {'check': 'check', 'call': 'call', 'fold': 'fold', 'bet0.33': 'bet 33%', 'bet0.75': 'bet 75%', 'allin': 'all-in'}

def reaches():
    """own reach (per hand) of each player at each decision node"""
    out = {}
    def rec(node, r):
        if node.kind == 'decision':
            out[node.idx] = [r[0].copy(), r[1].copy()]
            for a, c in enumerate(node.children):
                nr = [r[0], r[1]]; nr[node.player] = r[node.player] * sigma[node.idx][:, a]
                rec(c, nr)
        else:
            for c in node.children:
                rec(c, r)
    rec(g.root, [g.root_reach[0].copy(), g.root_reach[1].copy()])
    return out
REACH = reaches()

def grid(ax, idx, title):
    n = g.decisions[idx]; p = n.player
    w = REACH[idx][p]                                   # range weight reaching this node
    cls = [hand_class(h) for h in g.hands[p]]
    R = RANKS[::-1]
    for i, r1 in enumerate(R):
        for j, r2 in enumerate(R):
            c = r1 + r2 if i == j else (r1 + r2 + 's' if i < j else r2 + r1 + 'o')
            sel = np.array([k == c for k in cls])
            x0, y0 = j, 12 - i
            tot = w[sel].sum() if sel.any() else 0.0
            if tot <= 1e-9:
                ax.add_patch(Rectangle((x0, y0), 1, 1, fc='#eeeeee', ec='white', lw=0.6))
                fcol = '#aaaaaa'
            else:
                freq = (w[sel, None] * sigma[idx][sel]).sum(0) / tot
                xx = x0
                for a, f in zip(n.actions, freq):
                    if f > 1e-4:
                        ax.add_patch(Rectangle((xx, y0), f, 1, fc=COL[a], ec='none'))
                        xx += f
                ax.add_patch(Rectangle((x0, y0), 1, 1, fc='none', ec='white', lw=0.6))
                fcol = 'white'
            ax.text(x0 + 0.5, y0 + 0.5, c, ha='center', va='center', fontsize=4.6, color=fcol)
    ax.set_xlim(0, 13); ax.set_ylim(0, 13); ax.set_aspect('equal'); ax.axis('off')
    ax.set_title(title, fontsize=9)
    # overall frequencies (range-weighted)
    freq = (w[:, None] * sigma[idx]).sum(0) / w.sum()
    return dict(zip(n.actions, freq))

def legend(fig, acts, y=0.02):
    hs = [Rectangle((0, 0), 1, 1, fc=COL[a]) for a in acts]
    fig.legend(hs, [NAME[a] for a in acts], loc='lower center', ncol=len(acts), frameon=False,
               bbox_to_anchor=(0.5, y), fontsize=8, handlelength=1.2)

if __name__ == '__main__':
    # OOP first action, and IP after a check
    fig, axs = plt.subplots(1, 2, figsize=(6.4, 3.5))
    f0 = grid(axs[0], 0, 'Big blind (out of position): first action')
    f1 = grid(axs[1], 1, 'Button (in position) after a check')
    legend(fig, ['check', 'bet0.33', 'bet0.75', 'allin'])
    fig.subplots_adjust(left=0.01, right=0.99, top=0.92, bottom=0.1, wspace=0.05)
    fig.savefig('../figs/grid_root.pdf'); plt.close(fig)
    print('OOP root', {k: round(v, 3) for k, v in f0.items()})
    print('IP vs check', {k: round(v, 3) for k, v in f1.items()})
    # facing a 75% bet
    fig, axs = plt.subplots(1, 2, figsize=(6.4, 3.5))
    f2 = grid(axs[0], 9, 'Button facing a 75% pot bet')
    f3 = grid(axs[1], 4, 'Big blind facing a 75% pot bet')
    legend(fig, ['fold', 'call', 'allin'])
    fig.subplots_adjust(left=0.01, right=0.99, top=0.92, bottom=0.1, wspace=0.05)
    fig.savefig('../figs/grid_facing.pdf'); plt.close(fig)
    print('IP vs 75', {k: round(v, 3) for k, v in f2.items()})
    print('OOP vs 75', {k: round(v, 3) for k, v in f3.items()})
    # pot odds / minimum defence frequency check at every node facing a bet
    rows = []
    for n in g.decisions:
        if n.actions[0] != 'fold':
            continue
        p = n.player; w = REACH[n.idx][p]
        if w.sum() <= 1e-12:
            print(f'{n.name}: never reached in this equilibrium'); continue
        # the bet faced: from node name contributions
        c = [float(v) for v in n.name[3:].split('-')]
        bet = abs(c[1] - c[0]); pot_before = 100 + 2 * min(c)
        s = bet / pot_before
        freq = (w[:, None] * sigma[n.idx]).sum(0) / w.sum()
        rows.append((n.name, p, s, 1 - freq[0], 1 / (1 + s)))
        print(f'{n.name}: player {p} faces bet {s:.2f} pot: defends {1-freq[0]:.3f}  MDF 1/(1+s) = {1/(1+s):.3f}')
    pickle.dump(rows, open('../results/mdf.pkl', 'wb'))
