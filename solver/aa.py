"""
Anderson acceleration (AA) of regret-matching fixed-point maps.

Observation: one alternating CFR+ sweep is a map F on the nonnegative regret state R.  A point R*
is a fixed point, F(R*) = R*, iff for every information set and action
      R*_a > 0  =>  instantaneous regret r_a = 0,     R*_a = 0  =>  r_a <= 0,
i.e. the strategy sigma(R*) proportional to R* is a best response at every information set for both
players: a Nash equilibrium.  CFR+ is the Picard iteration R <- F(R).  Anderson acceleration (a
multisecant quasi-Newton method on the residual G(R) = F(R) - R) extrapolates from the last m
iterates.  We project the extrapolated point back onto R >= 0 and safeguard by the residual norm.
"""
import numpy as np
from cfr import Tree, rm_strategy


class RegretMap:
    """F(x) = one alternating CFR+ (or PCFR+) sweep, on a flat state vector x."""

    def __init__(self, game, predictive=False):
        self.T = Tree(game)
        self.g = game
        self.predictive = predictive
        self.shapes = [(game.nh[n.player], len(n.actions)) for n in game.decisions]
        self.sizes = [a * b for a, b in self.shapes]
        self.offsets = np.concatenate([[0], np.cumsum(self.sizes)])
        self.n = int(self.offsets[-1])
        self.p_nodes = [self.T.player_nodes(0), self.T.player_nodes(1)]
        self.nevals = 0

    def unpack(self, x):
        return [x[self.offsets[i]:self.offsets[i + 1]].reshape(self.shapes[i]) for i in range(len(self.shapes))]

    def pack(self, arrs):
        return np.concatenate([a.ravel() for a in arrs])

    def strategy(self, x):
        if self.predictive:
            R, m = self.unpack(x[:self.n]), self.unpack(x[self.n:])
            return [rm_strategy(R[i] + m[i]) for i in range(len(R))]
        return [rm_strategy(r) for r in self.unpack(x)]

    def F(self, x):
        """One alternating sweep.  Returns the new state."""
        self.nevals += 1
        if self.predictive:
            R = [r.copy() for r in self.unpack(x[:self.n])]
            m = [r.copy() for r in self.unpack(x[self.n:])]
        else:
            R = [r.copy() for r in self.unpack(x)]
            m = None
        for p in (0, 1):
            sigma = [rm_strategy(R[i] + m[i]) if m is not None else rm_strategy(R[i]) for i in range(len(R))]
            r = {}
            self.T.cfv(p, sigma, regret_out=r)
            for i, ri in r.items():
                R[i] = np.maximum(R[i] + ri, 0.0)
                if m is not None:
                    m[i] = ri
        if self.predictive:
            return np.concatenate([self.pack(R), self.pack(m)])
        return self.pack(R)

    def x0(self):
        return np.zeros(2 * self.n if self.predictive else self.n)

    def exploitability(self, x):
        return self.T.exploitability(self.strategy(x))


def anderson(rmap, iters=1000, mem=5, reg=1e-10, safeguard=True, log_every=10, clip=True,
             restart_ratio=1.0, callback=None, x0=None):
    """Safeguarded type-II Anderson acceleration of x <- F(x).

    Each iteration costs exactly one evaluation of F (one CFR sweep), like CFR+ itself.
    Safeguard: the AA candidate is accepted for the next step only if its residual norm does not
    exceed restart_ratio * (residual norm of the last accepted Picard point); otherwise memory is
    cleared and we fall back to the plain CFR+ step."""
    x = rmap.x0() if x0 is None else x0.copy()
    fx = rmap.F(x)
    gx = fx - x
    Xs, Gs = [], []          # histories of F(x) and residuals
    hist = []
    n_acc = n_rej = 0
    best = (np.inf, None)
    for k in range(1, iters + 1):
        Xs.append(fx.copy()); Gs.append(gx.copy())
        if len(Xs) > mem + 1:
            Xs.pop(0); Gs.pop(0)
        if len(Xs) >= 2:
            dG = np.stack([Gs[i + 1] - Gs[i] for i in range(len(Gs) - 1)], axis=1)
            dF = np.stack([Xs[i + 1] - Xs[i] for i in range(len(Xs) - 1)], axis=1)
            A = dG.T @ dG
            A += reg * np.trace(A) / A.shape[0] * np.eye(A.shape[0]) + 1e-300 * np.eye(A.shape[0])
            gam = np.linalg.solve(A, dG.T @ gx)
            x_new = fx - dF @ gam
            if clip:
                x_new = np.maximum(x_new, 0.0) if not rmap.predictive else np.concatenate(
                    [np.maximum(x_new[:rmap.n], 0.0), x_new[rmap.n:]])
        else:
            x_new = fx
        f_new = rmap.F(x_new)
        g_new = f_new - x_new
        if safeguard and len(Xs) >= 2 and np.linalg.norm(g_new) > restart_ratio * np.linalg.norm(gx):
            # reject: take the plain step instead, clear memory
            n_rej += 1
            x_new = fx
            f_new = rmap.F(x_new)
            g_new = f_new - x_new
            Xs, Gs = [], []
        elif len(Xs) >= 2:
            n_acc += 1
        x, fx, gx = x_new, f_new, g_new
        if k % log_every == 0 or k == 1 or k == iters:
            e = rmap.exploitability(x)
            hist.append((rmap.nevals, e, np.linalg.norm(gx)))
            if e < best[0]:
                best = (e, x.copy())
            if callback:
                callback(k, hist[-1])
    return x, hist, dict(accepted=n_acc, rejected=n_rej, best=best)
