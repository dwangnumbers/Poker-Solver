"""Independent check of two chance levels: a small flop game built with solver/games.py (explicit chance nodes for
the turn and the river card), flop and turn betting, river checked down, solved exactly by the sequence-form LP.
python3 flop_lp.py cfg.json -> {"value0": ..., "Z": ..., "sequences": [...]}"""
import sys, json
sys.path.insert(0, '/home/claude/poker-solver/solver')
import numpy as np
from games import Node, Game, card, eval7
from seqform import SeqForm
from lp import solve_lp

cfg = json.load(open(sys.argv[1]))
board = [card(c) for c in cfg['board']]
hands = [[tuple(sorted((card(h[:2]), card(h[2:])))) for h in cfg['hands'][p]] for p in (0, 1)]
P = cfg['pot']
n0, n1 = len(hands[0]), len(hands[1])
C = np.array([[0.0 if set(a) & set(b) else 1.0 for b in hands[1]] for a in hands[0]])
mask = lambda p, cs: np.array([0.0 if set(cs) & set(h) else 1.0 for h in hands[p]])
bases = {'norm': C, 'fold': C}
deck = [c for c in range(52) if c not in board]
K1, K2 = len(deck) - 4, len(deck) - 5          # 45 turn cards and 44 river cards once both hands are known
for t in deck:
    bases[f'f{t}'] = C * np.outer(mask(0, [t]), mask(1, [t])) / K1
    for r in deck:
        if r == t: continue
        W = C * np.outer(mask(0, [t, r]), mask(1, [t, r])) / (K1 * K2)
        s0 = [eval7(list(h) + board + [t, r]) for h in hands[0]]; s1 = [eval7(list(h) + board + [t, r]) for h in hands[1]]
        bases[f's{t}_{r}'] = np.array([[(a > b) - (a < b) for b in s1] for a in s0], float) * W

def street(contrib, player, facing, nb, bet, cont, fold_base):
    other = 1 - player
    if facing:
        gain0 = (P / 2 + contrib[1]) if player == 1 else -(P / 2 + contrib[0])
        c = max(contrib)
        return Node('decision', player=player, actions=['fold', 'call'], children=[Node('fold', amount=gain0, base=fold_base), cont([c, c])])
    kids = [street(contrib, 1, False, nb, bet, cont, fold_base) if player == 0 else cont(contrib)]
    acts = ['check']
    if nb < 1:
        pot = P + contrib[0] + contrib[1]
        new = list(contrib); new[player] = contrib[player] + bet * pot
        kids.append(street(new, other, True, nb + 1, bet, cont, fold_base)); acts.append('bet')
    return Node('decision', player=player, actions=acts, children=kids)

def river_chance(contrib, t):
    rs = [r for r in deck if r != t]
    return Node('chance', children=[Node('showdown', amount=P / 2 + contrib[0], base=f's{t}_{r}') for r in rs], actions=[str(r) for r in rs])

def turn_chance(contrib):
    kids = [street(contrib, 0, False, 0, cfg['turn_bet'], lambda c, t=t: river_chance(c, t), f'f{t}') for t in deck]
    return Node('chance', children=kids, actions=[str(t) for t in deck])

root = street([0, 0], 0, False, 0, cfg['flop_bet'], turn_chance, 'fold')
g = Game(root, [n0, n1], bases, [np.ones(n0), np.ones(n1)], 'flop test')
sf = SeqForm(g)
res = solve_lp(sf)
print(json.dumps({'value0': float(res[4]), 'Z': g.Z}))
