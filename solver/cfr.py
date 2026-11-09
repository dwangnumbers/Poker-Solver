"""
Range-vectorized CFR variants on public trees, plus exact best response / exploitability.

All algorithms use *alternating* updates (a Gauss-Seidel sweep: update player 0, then player 1 using
player 0's new strategy), as in CFR+ and modern solvers.

State conventions: R[i] is the |H_p| x |A| regret matrix at decision node i, for its acting player.
"""
import numpy as np


def rm_strategy(R):
    """Regret matching: normalise positive regrets per row; uniform if all <= 0."""
    Rp = np.maximum(R, 0.0)
    s = Rp.sum(axis=1, keepdims=True)
    n = R.shape[1]
    with np.errstate(invalid='ignore', divide='ignore'):
        out = np.where(s > 0, Rp / np.where(s > 0, s, 1.0), 1.0 / n)
    return out


class Tree:
    """Thin wrapper with traversal routines for a Game."""

    def __init__(self, game):
        self.g = game
        self.nodes = game.decisions

    # -- counterfactual values and instantaneous regrets for player p --------------------------------
    def cfv(self, p, sigma, regret_out=None, avg_out=None, avg_weight=0.0):
        """Return root counterfactual value vector of player p (over p's hands) under profile sigma.
        If regret_out is a dict, fill it with instantaneous regrets r[idx] (|H_p| x |A|) at p's nodes.
        If avg_out is given, accumulate avg_weight * own_reach * sigma into it (average strategy)."""
        g = self.g
        r0 = g.root_reach

        def rec(node, pi_own, pi_opp):
            k = node.kind
            if k in ('fold', 'showdown'):
                return g.terminal_value(node, p, pi_opp)
            if k == 'chance':
                v = 0.0
                for c in node.children:
                    v = v + rec(c, pi_own, pi_opp)
                return v
            s = sigma[node.idx]
            if node.player == p:
                vals = [rec(c, pi_own * s[:, a], pi_opp) for a, c in enumerate(node.children)]
                V = np.stack(vals, axis=1)                       # |H| x |A|
                v = (V * s).sum(axis=1)
                if regret_out is not None:
                    regret_out[node.idx] = V - v[:, None]
                if avg_out is not None:
                    avg_out[node.idx] += avg_weight * pi_own[:, None] * s
                return v
            v = 0.0
            for a, c in enumerate(node.children):
                v = v + rec(c, pi_own, pi_opp * s[:, a])
            return v
        return rec(g.root, r0[p].copy(), r0[1 - p].copy())

    def best_response_value(self, p, sigma):
        """Root best-response counterfactual value vector of player p against sigma[-p]."""
        g = self.g

        def rec(node, pi_opp):
            k = node.kind
            if k in ('fold', 'showdown'):
                return g.terminal_value(node, p, pi_opp)
            if k == 'chance':
                v = 0.0
                for c in node.children:
                    v = v + rec(c, pi_opp)
                return v
            if node.player == p:
                vals = [rec(c, pi_opp) for c in node.children]
                return np.max(np.stack(vals, axis=1), axis=1)
            s = sigma[node.idx]
            v = 0.0
            for a, c in enumerate(node.children):
                v = v + rec(c, pi_opp * s[:, a])
            return v
        return rec(g.root, g.root_reach[1 - p].copy())

    def exploitability(self, sigma):
        """(BR_0 + BR_1)/2 in the game's payoff units (per deal).  Zero iff sigma is a Nash equilibrium."""
        g = self.g
        b0 = g.root_reach[0] @ self.best_response_value(0, sigma)
        b1 = g.root_reach[1] @ self.best_response_value(1, sigma)
        return (b0 + b1) / (2.0 * g.Z)

    def game_value(self, sigma):
        return self.g.root_reach[0] @ self.cfv(0, sigma) / self.g.Z

    def uniform(self):
        return [np.full((self.g.nh[n.player], len(n.actions)), 1.0 / len(n.actions)) for n in self.nodes]

    def zeros(self):
        return [np.zeros((self.g.nh[n.player], len(n.actions))) for n in self.nodes]

    def normalize_avg(self, S):
        out = []
        for s in S:
            tot = s.sum(axis=1, keepdims=True)
            out.append(np.where(tot > 0, s / np.where(tot > 0, tot, 1.0), 1.0 / s.shape[1]))
        return out

    def player_nodes(self, p):
        return [n.idx for n in self.nodes if n.player == p]


# ================================================================================================
# Baseline solvers.  Each returns a history of (iteration, exploitability of average, of last iterate).
# ================================================================================================

def solve(game, algo='cfr+', iters=1000, log_every=10, alpha=1.5, beta=0.0, gamma=2.0, callback=None):
    T = Tree(game)
    R = T.zeros()
    S = T.zeros()                    # cumulative (weighted) strategy
    m = T.zeros()                    # prediction (PCFR+)
    hist = []
    p_nodes = [T.player_nodes(0), T.player_nodes(1)]
    for t in range(1, iters + 1):
        for p in (0, 1):
            # current strategies
            if algo == 'pcfr+':
                sigma = [rm_strategy(R[i] + m[i]) for i in range(len(R))]
            else:
                sigma = [rm_strategy(R[i]) for i in range(len(R))]
            # average-strategy weight for this iteration
            if algo == 'cfr+':
                w = float(t)
            elif algo in ('pcfr+',):
                w = float(t) ** 2
            elif algo == 'cfr':
                w = 1.0
            else:
                w = 1.0
            if algo == 'dcfr':
                for i in p_nodes[p]:
                    S[i] *= (t / (t + 1.0)) ** gamma if t > 1 else 1.0
            r = {}
            T.cfv(p, sigma, regret_out=r, avg_out=S if algo != 'none' else None, avg_weight=w)
            for i, ri in r.items():
                if algo == 'cfr':
                    R[i] += ri
                elif algo == 'cfr+':
                    R[i] = np.maximum(R[i] + ri, 0.0)
                elif algo == 'pcfr+':
                    R[i] = np.maximum(R[i] + ri, 0.0)
                    m[i] = ri
                elif algo == 'dcfr':
                    a = t ** alpha / (t ** alpha + 1.0)
                    b = t ** beta / (t ** beta + 1.0)
                    R[i] = np.where(R[i] > 0, R[i] * a, R[i] * b) + ri
        if t % log_every == 0 or t == 1 or t == iters:
            avg = T.normalize_avg(S)
            if algo == 'pcfr+':
                last = [rm_strategy(R[i] + m[i]) for i in range(len(R))]
            else:
                last = [rm_strategy(R[i]) for i in range(len(R))]
            hist.append((t, T.exploitability(avg), T.exploitability(last)))
            if callback:
                callback(t, hist[-1])
    return T, R, S, hist
