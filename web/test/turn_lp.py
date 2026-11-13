"""Independent check of chance-node handling: a small turn game built with solver/games.py (explicit chance node per river
card) and solved exactly by the sequence-form LP. Prints the value for player 0 per deal; compare with the JS engine."""
import sys, json, itertools
sys.path.insert(0, '/home/claude/poker-solver/solver')
import numpy as np
from games import Node, Game, card, eval7
from seqform import SeqForm
from lp import solve_lp

cfg = json.load(open(sys.argv[1]))
board = [card(c) for c in cfg['board']]
hands = [[tuple(sorted((card(h[:2]), card(h[2:])))) for h in cfg['hands'][p]] for p in (0, 1)]
P, S = cfg['pot'], cfg['stack']
n0, n1 = len(hands[0]), len(hands[1])
C = np.array([[0.0 if set(a) & set(b) else 1.0 for b in hands[1]] for a in hands[0]])
bases = {'norm': C, 'fold': C}
river_cards = [c for c in range(52) if c not in board]
for r in river_cards:
    m0 = np.array([0.0 if r in h else 1.0 for h in hands[0]]); m1 = np.array([0.0 if r in h else 1.0 for h in hands[1]])
    W = C * np.outer(m0, m1) / 44.0
    s0 = np.array([eval7(list(h) + board + [r]) for h in hands[0]], dtype=object)
    s1 = np.array([eval7(list(h) + board + [r]) for h in hands[1]], dtype=object)
    sg = np.array([[(a > b) - (a < b) for b in s1] for a in s0], float)
    bases[f'f{r}'] = W; bases[f's{r}'] = sg * W

def street(contrib, player, facing, nb, bet, cont, fold_base):
    other = 1 - player
    if facing:
        gain0 = (P / 2 + contrib[1]) if player == 1 else -(P / 2 + contrib[0])
        c = max(contrib)
        return Node('decision', player=player, actions=['fold', 'call'], children=[
            Node('fold', amount=gain0, base=fold_base), cont([c, c])])
    kids = [street(contrib, 1, False, nb, bet, cont, fold_base) if player == 0 else cont(contrib)]
    acts = ['check']
    if nb < 1:
        pot = P + contrib[0] + contrib[1]
        new = list(contrib); new[player] = contrib[player] + bet * pot
        kids.append(street(new, other, True, nb + 1, bet, cont, fold_base)); acts.append('bet')
    return Node('decision', player=player, actions=acts, children=kids)

def after_turn(contrib):
    kids = []
    for r in river_cards:
        kids.append(street(contrib, 0, False, 0, cfg['river_bet'], lambda c, r=r: Node('showdown', amount=P / 2 + c[0], base=f's{r}'), f'f{r}'))
    return Node('chance', children=kids, actions=[str(r) for r in river_cards])

root = street([0, 0], 0, False, 0, cfg['turn_bet'], after_turn, 'fold')
g = Game(root, [n0, n1], bases, [np.ones(n0), np.ones(n1)], 'turn test')
sf = SeqForm(g)
res = solve_lp(sf); v0 = res[4]
print(json.dumps({'value0': float(v0), 'Z': g.Z}))
