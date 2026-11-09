"""
Poker games as *public trees* with range-vectorized terminals.

Every game here has the structure: chance deals each player a private hand from a finite set H_p,
then players take public actions (and public chance events may reveal cards).  An information set
of player p is (public node, private hand), so a strategy at a public node is an |H_p| x |A| matrix.

Terminal values are bilinear in the two players' reach vectors:
        value for player 0  = pi_0^T  M  pi_1 ,   M = amount * B,
where B is a 'base' matrix shared by many terminals (chance weights x card compatibility, and for a
showdown also the sign of the hand-strength comparison).  Player 1 receives the negative (zero-sum).
"""
import itertools
import numpy as np


class Node:
    __slots__ = ('kind', 'player', 'children', 'actions', 'amount', 'base', 'idx', 'name', 'winner')

    def __init__(self, kind, **kw):
        self.kind = kind                    # 'decision' | 'chance' | 'fold' | 'showdown'
        self.player = kw.get('player')
        self.children = kw.get('children', [])
        self.actions = kw.get('actions', [])
        self.amount = kw.get('amount', 0.0)  # payoff to player 0 if player 0 wins (fold: signed)
        self.base = kw.get('base')           # key into game.bases
        self.winner = kw.get('winner')
        self.name = kw.get('name', '')
        self.idx = None                      # index among decision nodes


class Game:
    def __init__(self, root, nh, bases, root_reach, name, hand_labels=None):
        self.root, self.nh, self.bases, self.name = root, nh, bases, name
        self.root_reach = [np.asarray(r, float) for r in root_reach]
        self.hand_labels = hand_labels
        self.decisions = []
        self._index(root)
        r0, r1 = self.root_reach
        # normalising constant: total chance x compatibility weight of a deal
        self.Z = float(r0 @ bases['norm'] @ r1)

    def _index(self, node):
        if node.kind == 'decision':
            node.idx = len(self.decisions)
            self.decisions.append(node)
        for c in node.children:
            self._index(c)

    def num_infoset_actions(self):
        return sum(self.nh[n.player] * len(n.actions) for n in self.decisions)

    def terminal_value(self, node, p, pi_opp):
        """Counterfactual value vector for player p (over p's hands) at a terminal."""
        B = self.bases[node.base]
        if p == 0:
            return node.amount * (B @ pi_opp)
        return -node.amount * (B.T @ pi_opp)


# ------------------------------------------------------------------------------------------------
# Kuhn poker: 3 cards J<Q<K, ante 1, one bet of size 1.
def kuhn():
    H = 3
    C = np.ones((H, H)) - np.eye(H)            # different cards
    C /= C.sum()                               # chance probability of each deal (1/6)
    S = np.sign(np.subtract.outer(np.arange(H), np.arange(H))) * C   # player 0 wins if higher
    bases = {'fold': C, 'sd': S, 'norm': C}

    def T(kind, amount, winner=None):
        if kind == 'fold':
            return Node('fold', amount=amount, base='fold', winner=winner)
        return Node('showdown', amount=amount, base='sd')
    # amounts: payoff to player 0 (fold: +x if player 1 folded, -x if player 0 folded)
    p1_after_check = Node('decision', player=1, actions=['check', 'bet'], name='c', children=[
        T('sd', 1),
        Node('decision', player=0, actions=['fold', 'call'], name='cb', children=[T('fold', -1), T('sd', 2)])])
    p1_after_bet = Node('decision', player=1, actions=['fold', 'call'], name='b',
                        children=[T('fold', 1), T('sd', 2)])
    root = Node('decision', player=0, actions=['check', 'bet'], name='', children=[p1_after_check, p1_after_bet])
    return Game(root, [H, H], bases, [np.ones(H), np.ones(H)], 'Kuhn', ['J', 'Q', 'K'])


# ------------------------------------------------------------------------------------------------
# Leduc hold'em: deck J,J,Q,Q,K,K; ante 1; two betting rounds (bet 2 then 4), max 2 raises/round;
# one public card after round 1; pair with the board wins, otherwise higher card; ties split.
def leduc(bets=(2, 4), max_raises=2):
    H = 3
    # deal probabilities over (rank0, rank1) with card removal: 6*5 = 30 ordered deals
    C = np.array([[2 * (2 - (i == j)) for j in range(H)] for i in range(H)], float) / 30.0
    bases = {'norm': C, 'fold1': C}
    # public card r: weight of (i,j,r) = C[i,j] * (#r remaining)/4
    for r in range(H):
        W = np.array([[C[i, j] * (2 - (i == r) - (j == r)) / 4.0 for j in range(H)] for i in range(H)])
        def strength(i):
            return 10 + i if i == r else i
        S = np.array([[np.sign(strength(i) - strength(j)) for j in range(H)] for i in range(H)]) * W
        bases[f'fold2_{r}'] = W
        bases[f'sd_{r}'] = S

    def betting(round_, contrib, player, n_raises, facing, public, cont):
        """Build a betting round. contrib = [c0, c1] chips committed so far (incl. ante)."""
        b = bets[round_]
        acts, kids = [], []
        other = 1 - player
        if facing:
            # fold
            acts.append('fold')
            amt = contrib[player]                       # folder loses what they committed
            fold_key = 'fold1' if round_ == 0 else f'fold2_{public}'
            kids.append(Node('fold', amount=(-amt if player == 0 else amt), base=fold_key))
            # call
            acts.append('call')
            new = list(contrib); new[player] = contrib[other]
            kids.append(cont(new))
            if n_raises < max_raises:
                acts.append('raise')
                new = list(contrib); new[player] = contrib[other] + b
                kids.append(betting(round_, new, other, n_raises + 1, True, public, cont))
        else:
            acts.append('check')
            if player == 0:
                kids.append(betting(round_, contrib, other, n_raises, False, public, cont))
            else:
                kids.append(cont(contrib))
            acts.append('bet')
            new = list(contrib); new[player] = contrib[other] + b
            kids.append(betting(round_, new, other, n_raises + 1, True, public, cont))
        return Node('decision', player=player, actions=acts, children=kids,
                    name=f'r{round_}p{public}')

    def after_round1(contrib):
        kids = []
        for r in range(H):
            kids.append(betting(1, contrib, 0, 0, False, r,
                                lambda c, r=r: Node('showdown', amount=c[0], base=f'sd_{r}')))
        return Node('chance', children=kids, actions=['J', 'Q', 'K'], name='deal')

    root = betting(0, [1, 1], 0, 0, False, None, after_round1)
    return Game(root, [H, H], bases, [np.ones(H), np.ones(H)], 'Leduc', ['J', 'Q', 'K'])


# ------------------------------------------------------------------------------------------------
# No-limit hold'em river subgame with real hand ranges.
RANKS = '23456789TJQKA'
SUITS = 'cdhs'


def card(s):
    return RANKS.index(s[0]) * 4 + SUITS.index(s[1])


def card_str(c):
    return RANKS[c // 4] + SUITS[c % 4]


def eval7(cards):
    """Strength key of the best 5-card hand among 5-7 cards (bigger is better)."""
    ranks = sorted((c // 4 for c in cards), reverse=True)
    suits = [c % 4 for c in cards]
    counts = {r: ranks.count(r) for r in set(ranks)}
    # flush
    flush_suit = next((s for s in range(4) if suits.count(s) >= 5), None)

    def straight_high(rs):
        u = sorted(set(rs), reverse=True)
        if 12 in u:
            u = u + [-1]                            # wheel
        run = 1
        for i in range(1, len(u)):
            run = run + 1 if u[i] == u[i - 1] - 1 else 1
            if run >= 5:
                return u[i] + 4
        return None
    if flush_suit is not None:
        fr = sorted((c // 4 for c in cards if c % 4 == flush_suit), reverse=True)
        sh = straight_high(fr)
        if sh is not None:
            return (8, sh)
    by = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    if by[0][1] == 4:
        kick = max(r for r in ranks if r != by[0][0])
        return (7, by[0][0], kick)
    if by[0][1] == 3 and len(by) > 1 and by[1][1] >= 2:
        return (6, by[0][0], by[1][0])
    if flush_suit is not None:
        return (5,) + tuple(fr[:5])
    sh = straight_high(ranks)
    if sh is not None:
        return (4, sh)
    if by[0][1] == 3:
        k = [r for r in ranks if r != by[0][0]][:2]
        return (3, by[0][0]) + tuple(k)
    if by[0][1] == 2 and by[1][1] == 2:
        hi, lo = by[0][0], by[1][0]
        k = max(r for r in ranks if r != hi and r != lo)
        return (2, hi, lo, k)
    if by[0][1] == 2:
        k = [r for r in ranks if r != by[0][0]][:3]
        return (1, by[0][0]) + tuple(k)
    return (0,) + tuple(ranks[:5])


def river(board=('Ks', '7d', '2c', 'Th', '4s'), pot=100.0, stack=100.0,
          bet_sizes=(0.33, 0.75, 1.5), raise_sizes=(1.0,), max_raises=2,
          ranges=None, allin_threshold=0.67):
    """Heads-up river spot: OOP (player 0) and IP (player 1) with given ranges.
    Bet sizes are fractions of the pot; raises are fractions of the pot after calling.
    An all-in option is always available.  Payoffs are net chip changes relative to the start of
    the river (the pot already in the middle is split by the outcome)."""
    bcards = [card(c) for c in board]
    hands = [h for h in itertools.combinations(range(52), 2) if not set(h) & set(bcards)]
    nh = len(hands)
    keys = [eval7(list(h) + bcards) for h in hands]
    order = sorted(set(keys))
    strength = np.array([order.index(k) for k in keys])
    hs = [set(h) for h in hands]
    C = np.array([[0.0 if hs[i] & hs[j] else 1.0 for j in range(nh)] for i in range(nh)])
    S = np.sign(np.subtract.outer(strength, strength)) * C
    bases = {'norm': C, 'fold': C, 'sd': S}
    if ranges is None:
        ranges = [np.ones(nh), np.ones(nh)]
    ranges = [np.asarray(r, float) for r in ranges]

    def node(player, contrib, n_raises, facing):
        """contrib[i] = chips player i has put in on this river.  pot = initial pot."""
        other = 1 - player
        acts, kids = [], []
        to_call = contrib[other] - contrib[player]
        if facing:
            acts.append('fold')
            # player folds: other wins pot + contrib[player]; payoff to 0 relative to start of river
            gain0 = (pot / 2 + contrib[1]) if player == 1 else -(pot / 2 + contrib[0])
            kids.append(Node('fold', amount=gain0, base='fold'))
            acts.append('call')
            c = max(contrib)
            kids.append(Node('showdown', amount=pot / 2 + c, base='sd'))
            if n_raises < max_raises and contrib[other] < stack:
                cur_pot = pot + 2 * contrib[other]
                sizes = sorted(set([min(contrib[other] + f * cur_pot, stack) for f in raise_sizes] + [stack]))
                for s in sizes:
                    if s <= contrib[other]:
                        continue
                    acts.append('allin' if s >= stack else f'raise{(s - contrib[other]) / cur_pot:.2f}')
                    new = list(contrib); new[player] = s
                    kids.append(node(other, new, n_raises + 1, True))
        else:
            acts.append('check')
            kids.append(node(other, contrib, n_raises, False) if player == 0 else
                        Node('showdown', amount=pot / 2, base='sd'))
            sizes = sorted(set([min(f * pot, stack) for f in bet_sizes] + [stack]))
            for s in sizes:
                acts.append('allin' if s >= stack else f'bet{s / pot:.2f}')
                new = list(contrib); new[player] = s
                kids.append(node(other, new, n_raises + 1, True))
        return Node('decision', player=player, actions=acts, children=kids,
                    name=f'p{player}c{contrib[0]:.0f}-{contrib[1]:.0f}')

    root = node(0, [0.0, 0.0], 0, False)
    labels = [card_str(a) + card_str(b) for a, b in hands]
    g = Game(root, [nh, nh], bases, ranges, f'River {" ".join(board)}', labels)
    g.hands, g.strength, g.board = hands, strength, board
    g.pot = pot
    return g
