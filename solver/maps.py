"""
Fixed-point maps whose fixed points are Nash equilibria, and a generic safeguarded Anderson driver.
"""
import numpy as np
from cfr import Tree, rm_strategy


class FlatMap:
    def __init__(self, game):
        self.g = game
        self.T = Tree(game)
        self.shapes = [(game.nh[n.player], len(n.actions)) for n in game.decisions]
        self.sizes = [a * b for a, b in self.shapes]
        self.offsets = np.concatenate([[0], np.cumsum(self.sizes)])
        self.n = int(self.offsets[-1])
        self.nevals = 0

    def unpack(self, x):
        return [x[self.offsets[i]:self.offsets[i + 1]].reshape(self.shapes[i]) for i in range(len(self.shapes))]

    def pack(self, arrs):
        return np.concatenate([a.ravel() for a in arrs])


class StepMap(FlatMap):
    """sigma -> normalize([sigma + eta * r(sigma)]^+), alternating players.
    eta at (node, hand) = c / (mean |child value| + floor): a scale-free step."""

    def __init__(self, game, c=1.0, floor=1e-12):
        super().__init__(game)
        self.c, self.floor = c, floor

    def x0(self):
        return self.pack(self.T.uniform())

    def project(self, x):
        out = []
        for s in self.unpack(x):
            s = np.maximum(s, 0.0)
            tot = s.sum(axis=1, keepdims=True)
            out.append(np.where(tot > 0, s / np.where(tot > 0, tot, 1.0), 1.0 / s.shape[1]))
        return self.pack(out)

    def F(self, x):
        self.nevals += 1
        sig = [s.copy() for s in self.unpack(x)]
        for p in (0, 1):
            r, vals = {}, {}
            self._cfv_vals(p, sig, r, vals)
            for i, ri in r.items():
                scale = vals[i] + self.floor
                s = np.maximum(sig[i] + self.c * ri / scale[:, None], 0.0)
                sig[i] = s / s.sum(axis=1, keepdims=True)
        return self.pack(sig)

    def _cfv_vals(self, p, sigma, r_out, scale_out):
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
            s = sigma[node.idx]
            if node.player == p:
                V = np.stack([rec(c, pi_opp) for c in node.children], axis=1)
                v = (V * s).sum(axis=1)
                r_out[node.idx] = V - v[:, None]
                scale_out[node.idx] = np.abs(V).mean(axis=1)
                return v
            v = 0.0
            for a, c in enumerate(node.children):
                v = v + rec(c, pi_opp * s[:, a])
            return v
        rec(g.root, g.root_reach[1 - p].copy())

    def exploitability(self, x):
        return self.T.exploitability(self.unpack(x))


def anderson_generic(m, iters=1000, mem=10, reg=1e-10, restart_ratio=1.0, log_every=10, x0=None, safeguard=True):
    x = m.x0() if x0 is None else x0.copy()
    fx = m.F(x); gx = fx - x
    Fs, Gs, hist = [], [], []
    acc = rej = 0
    best = (np.inf, None)
    for k in range(1, iters + 1):
        Fs.append(fx.copy()); Gs.append(gx.copy())
        if len(Fs) > mem + 1:
            Fs.pop(0); Gs.pop(0)
        if len(Fs) >= 2:
            dG = np.stack([Gs[i + 1] - Gs[i] for i in range(len(Gs) - 1)], 1)
            dF = np.stack([Fs[i + 1] - Fs[i] for i in range(len(Fs) - 1)], 1)
            A = dG.T @ dG
            A += (reg * np.trace(A) / A.shape[0] + 1e-300) * np.eye(A.shape[0])
            gam = np.linalg.solve(A, dG.T @ gx)
            xn = m.project(fx - dF @ gam)
        else:
            xn = fx
        fn = m.F(xn); gn = fn - xn
        if safeguard and len(Fs) >= 2 and np.linalg.norm(gn) > restart_ratio * np.linalg.norm(gx):
            rej += 1
            xn = fx; fn = m.F(xn); gn = fn - xn
            Fs, Gs = [], []
        elif len(Fs) >= 2:
            acc += 1
        x, fx, gx = xn, fn, gn
        if k % log_every == 0 or k == 1 or k == iters:
            e = m.exploitability(x)
            hist.append((m.nevals, e, float(np.linalg.norm(gx))))
            if e < best[0]:
                best = (e, x.copy())
    return x, hist, dict(accepted=acc, rejected=rej, best=best)


class ProxCFRMap(FlatMap):
    """One alternating CFR+ sweep on the *proximally regularized* game
          max_x min_y   x^T A y  - (mu/2)||x - x_ref||^2  + (mu/2)||y - y_ref||^2
    in sequence form (x = own reach * behavioural strategy, per hand).  The regularizer's gradient
    enters CFR as a reward transformation at each sequence:
          v_a(h)  <-  v_a(h) - mu * (x_a(h) - x_ref_a(h)).
    The regularized game has a unique equilibrium (the proximal point of the reference); its CFR+
    last iterate converges to it.  State = nonnegative regrets (flat)."""

    def __init__(self, game, mu):
        super().__init__(game)
        self.mu = mu
        self.xref = None            # list of |H| x |A| sequence-form arrays (own reach incl. range)
        self.p_nodes = [self.T.player_nodes(0), self.T.player_nodes(1)]

    def x0(self):
        return np.zeros(self.n)

    def project(self, x):
        return np.maximum(x, 0.0)

    def strategy(self, x):
        return [rm_strategy(r) for r in self.unpack(x)]

    def exploitability(self, x):
        return self.T.exploitability(self.strategy(x))

    def sequence_form(self, sigma):
        """x_a(h) at every decision node = own reach (incl. root range) * sigma."""
        g = self.g
        out = [None] * len(sigma)

        def rec(node, reach):
            if node.kind in ('fold', 'showdown'):
                return
            if node.kind == 'chance':
                for c in node.children:
                    rec(c, reach)
                return
            p = node.player
            s = sigma[node.idx]
            out[node.idx] = reach[p][:, None] * s
            for a, c in enumerate(node.children):
                nr = list(reach); nr[p] = reach[p] * s[:, a]
                rec(c, nr)
        rec(g.root, [g.root_reach[0].copy(), g.root_reach[1].copy()])
        return out

    def set_reference(self, sigma):
        self.xref = self.sequence_form(sigma)

    def F(self, x):
        self.nevals += 1
        R = [r.copy() for r in self.unpack(x)]
        g, mu, xref = self.g, self.mu, self.xref
        for p in (0, 1):
            sigma = [rm_strategy(r) for r in R]

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
                    V = np.stack([rec(c, pi_own * s[:, a], pi_opp) for a, c in enumerate(node.children)], axis=1)
                    # reward transformation: gradient of -(mu/2)||x - x_ref||^2 w.r.t. sequence x
                    V = V - mu * (pi_own[:, None] * s - xref[node.idx])
                    v = (V * s).sum(axis=1)
                    R[node.idx] = np.maximum(R[node.idx] + V - v[:, None], 0.0)
                    return v
                v = 0.0
                for a, c in enumerate(node.children):
                    v = v + rec(c, pi_own, pi_opp * s[:, a])
                return v
            rec(g.root, g.root_reach[p].copy(), g.root_reach[1 - p].copy())
        return self.pack(R)
