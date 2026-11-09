"""The two input ranges of the river spot, as 13x13 grids (fraction of combos of each class in the range)."""
import numpy as np, itertools
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from games import RANKS, BB_CALL, BTN_OPEN, expand_range, hand_class, card
plt.rcParams.update({'font.family': 'serif', 'font.size': 9, 'pdf.fonttype': 42})
board = [card(c) for c in ('Ks', '7d', '2c', 'Th', '4s')]
allh = [h for h in itertools.combinations(range(52), 2)]
live = [h for h in allh if not set(h) & set(board)]

def grid(ax, spec, title, col):
    cls = expand_range(spec)
    R = RANKS[::-1]
    tot = 0
    for i, r1 in enumerate(R):
        for j, r2 in enumerate(R):
            c = r1 + r2 if i == j else (r1 + r2 + 's' if i < j else r2 + r1 + 'o')
            n_all = sum(1 for h in allh if hand_class(h) == c)
            n_live = sum(1 for h in live if hand_class(h) == c)
            inr = c in cls
            frac = n_live / n_all if inr else 0.0
            tot += n_live if inr else 0
            ax.add_patch(Rectangle((j, 12 - i), 1, 1, fc='#eeeeee', ec='white', lw=0.6))
            if inr:
                ax.add_patch(Rectangle((j, 12 - i), frac, 1, fc=col, ec='none'))
            ax.text(j + 0.5, 12 - i + 0.5, c, ha='center', va='center', fontsize=4.6, color='white' if inr else '#aaaaaa')
    ax.set_xlim(0, 13); ax.set_ylim(0, 13); ax.set_aspect('equal'); ax.axis('off')
    ax.set_title(f'{title}: {tot} combos', fontsize=9)
    return tot

fig, axs = plt.subplots(1, 2, figsize=(6.4, 3.3))
n0 = grid(axs[0], BB_CALL, 'Big blind range', '#2a78d6')
n1 = grid(axs[1], BTN_OPEN, 'Button range', '#eb6834')
fig.subplots_adjust(left=0.01, right=0.99, top=0.9, bottom=0.02, wspace=0.05)
fig.savefig('../figs/ranges.pdf'); print(n0, n1)
