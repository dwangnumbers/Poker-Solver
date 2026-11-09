"""
Sequence form of a public-tree poker game, and *CFR + crossover*.

Sequence form (Koller-Megiddo-von Stengel; von Stengel 1996):
    player 0 maximises x^T A y,  player 1 minimises,   E x = e, F y = f, x, y >= 0.
Sequences of player p: the empty sequence, and (decision node i, hand h, action a) for p's nodes.
An information set (i, h) has the constraint  sum_a x(i,h,a) = x(parent sequence).

Equilibrium (LP duality + complementary slackness):
    E^T p - A y >= 0  (= 0 where x > 0),       A^T x - F^T q >= 0  (= 0 where y > 0).
Given the supports S0 = {x > 0}, S1 = {y > 0}, the equilibrium therefore solves the SQUARE linear system
    E x = e,  F y = f,  (E^T p - A y)_{S0} = 0,  (A^T x - F^T q)_{S1} = 0,   x_{~S0} = 0, y_{~S1} = 0
in the unknowns (x_S0, y_S1, p, q).  This is the analogue of 'crossover' in LP solvers: a first-order
method identifies the optimal face, then linear algebra lands exactly on the vertex/face.
"""
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from cfr import Tree


class SeqForm:
    def __init__(self, game):
        self.g = g = game
        self.T = Tree(game)
        # sequence numbering: 0 = empty sequence; then (node, hand, action) blocks per player
        self.seq_index = [dict(), dict()]     # node idx -> base offset (|H| x |A| block, row-major)
        self.nseq = [1, 1]
        self.parent = {}                      # (p, node idx) -> parent node idx (or None) and action
        self.infosets = [[], []]              # list of node idx per player (each gives |H| infosets)
        self._walk(g.root, [None, None])
        for p in (0, 1):
            for n in g.decisions:
                if n.player == p:
                    self.seq_index[p][n.idx] = self.nseq[p]
                    self.nseq[p] += g.nh[p] * len(n.actions)
        self._build()

    def _walk(self, node, last):
        """Record, for each decision node, the parent (node, action) of its acting player."""
        if node.kind == 'decision':
            p = node.player
            self.parent[node.idx] = last[p]
            self.infosets[p].append(node.idx)
            for a, c in enumerate(node.children):
                nl = list(last); nl[p] = (node.idx, a)
                self._walk(c, nl)
        else:
            for c in node.children:
                self._walk(c, last)

    def seq(self, p, node_idx, h, a):
        n = self.g.decisions[node_idx]
        return self.seq_index[p][node_idx] + h * len(n.actions) + a

    def parent_seq(self, p, node_idx, h):
        par = self.parent[node_idx]
        return 0 if par is None else self.seq(p, par[0], h, par[1])

    def _build(self):
        g = self.g
        # constraint matrices
        self.E, self.e = self._constraints(0)
        self.F, self.f = self._constraints(1)
        # payoff matrix A (player 0's payoff), from terminals: last sequences of each player
        rows, cols, vals = [], [], []
        r0, r1 = g.root_reach

        def rec(node, last):
            if node.kind in ('fold', 'showdown'):
                B = g.bases[node.base] * node.amount
                assert last[0] is not None and last[1] is not None, 'terminal before both players acted'
                i0, a0 = last[0]; i1, a1 = last[1]
                n0 = len(g.decisions[i0].actions); n1 = len(g.decisions[i1].actions)
                h0, h1 = np.nonzero(B)
                rows.append(self.seq_index[0][i0] + h0 * n0 + a0)
                cols.append(self.seq_index[1][i1] + h1 * n1 + a1)
                vals.append(B[h0, h1] * r0[h0] * r1[h1] / g.Z)
                return
            if node.kind == 'chance':
                for c in node.children:
                    rec(c, last)
                return
            for a, c in enumerate(node.children):
                nl = list(last); nl[node.player] = (node.idx, a)
                rec(c, nl)
        rec(g.root, [None, None])
        self.A = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                               shape=(self.nseq[0], self.nseq[1]))

    def _constraints(self, p):
        g = self.g
        rows, cols, vals = [0], [0], [1.0]
        r = 1
        for ni in self.infosets[p]:
            n = g.decisions[ni]
            for h in range(g.nh[p]):
                rows.append(r); cols.append(self.parent_seq(p, ni, h)); vals.append(-1.0)
                for a in range(len(n.actions)):
                    rows.append(r); cols.append(self.seq(p, ni, h, a)); vals.append(1.0)
                r += 1
        M = sp.csr_matrix((vals, (rows, cols)), shape=(r, self.nseq[p]))
        rhs = np.zeros(r); rhs[0] = 1.0
        return M, rhs

    # -- conversions ---------------------------------------------------------------------------------
    def to_seq(self, sigma, p):
        x = np.zeros(self.nseq[p]); x[0] = 1.0
        g = self.g
        for ni in self.infosets[p]:                      # infosets listed in tree (pre-)order
            n = g.decisions[ni]
            for h in range(g.nh[p]):
                par = x[self.parent_seq(p, ni, h)]
                for a in range(len(n.actions)):
                    x[self.seq(p, ni, h, a)] = par * sigma[ni][h, a]
        return x

    def to_behavioral(self, x, p, fallback):
        g = self.g
        out = [s.copy() for s in fallback]
        for ni in self.infosets[p]:
            n = g.decisions[ni]
            na = len(n.actions)
            base = self.seq_index[p][ni]
            blk = np.maximum(x[base:base + g.nh[p] * na].reshape(g.nh[p], na), 0.0)
            tot = blk.sum(axis=1)
            ok = tot > 1e-300
            out[ni][ok] = blk[ok] / tot[ok, None]
        return out

    # -- crossover -------------------------------------------------------------------------------------
    def support_from(self, sigma, p, tau):
        """Support guess: sequences whose behavioural probability exceeds tau AND whose parent is in the
        support (i.e. reachable under the guessed support)."""
        g = self.g
        S = np.zeros(self.nseq[p], bool); S[0] = True
        for ni in self.infosets[p]:
            n = g.decisions[ni]
            for h in range(g.nh[p]):
                if not S[self.parent_seq(p, ni, h)]:
                    continue
                for a in range(len(n.actions)):
                    if sigma[ni][h, a] > tau:
                        S[self.seq(p, ni, h, a)] = True
        return S

    def dual_estimates(self, sigma):
        """Dual variables from best-response values: p_I = r0(h) BR0(I,h)/Z, q_J = -r1(h) BR1(J,h)/Z."""
        g = self.g
        out = []
        for pl, M in ((0, self.E), (1, self.F)):
            vals = {}
            root = self.T.best_response_value(pl, sigma, node_values=vals)
            sign = 1.0 if pl == 0 else -1.0
            d = np.zeros(M.shape[0])
            d[0] = sign * (g.root_reach[pl] @ root) / g.Z
            r = 1
            for ni in self.infosets[pl]:
                d[r:r + g.nh[pl]] = sign * g.root_reach[pl] * vals[ni] / g.Z
                r += g.nh[pl]
            out.append(d)
        return out

    def crossover(self, sigma, tau=1e-3, solver='project', S0=None, S1=None):
        """Solve the support-restricted equilibrium system.  Returns (sigma_new, info).
        solver='project': the solution closest (Euclidean) to the CFR point and its dual estimates,
        computed with LSQR started at that point (for a consistent system LSQR from z0 converges to
        the minimiser of ||z - z0|| over the solution set)."""
        if S0 is None:
            S0 = self.support_from(sigma, 0, tau)
        if S1 is None:
            S1 = self.support_from(sigma, 1, tau)
        E, F, A = self.E, self.F, self.A
        i0, i1 = np.nonzero(S0)[0], np.nonzero(S1)[0]
        # infoset rows that are 'live' (their parent sequence is in the support)
        r0 = np.unique(E[:, i0].nonzero()[0]); r1 = np.unique(F[:, i1].nonzero()[0])
        E0, F1 = E[r0][:, i0], F[r1][:, i1]
        A01 = A[i0][:, i1]
        m0, m1, k0, k1 = len(r0), len(r1), len(i0), len(i1)
        # unknown order: [x_S0 (k0), y_S1 (k1), p (m0), q (m1)]
        Z = lambda a, b: sp.csr_matrix((a, b))
        K = sp.bmat([[E0, Z(m0, k1), Z(m0, m0), Z(m0, m1)],
                     [Z(m1, k0), F1, Z(m1, m0), Z(m1, m1)],
                     [Z(k0, k0), -A01, E0.T, Z(k0, m1)],
                     [A01.T, Z(k1, k1), Z(k1, m0), -F1.T]], format='csc')
        rhs = np.concatenate([self.e[r0], self.f[r1], np.zeros(k0), np.zeros(k1)])
        info = dict(k0=k0, k1=k1, m0=m0, m1=m1, n=K.shape[0])
        if solver == 'project':
            x0s, y0s = self.to_seq(sigma, 0), self.to_seq(sigma, 1)
            pd, qd = self.dual_estimates(sigma)
            z0 = np.concatenate([x0s[i0], y0s[i1], pd[r0], qd[r1]])
            d = spla.lsqr(K, rhs - K @ z0, atol=1e-15, btol=1e-15, iter_lim=50 * K.shape[0])[0]
            z = z0 + d
        else:
            z = spla.lsqr(K, rhs, atol=1e-15, btol=1e-15, iter_lim=50 * K.shape[0])[0]
        self.last = dict(S0=S0, S1=S1, i0=i0, i1=i1, r0=r0, r1=r1, z=z, K=K)
        info['residual'] = float(np.linalg.norm(K @ z - rhs))
        x = np.zeros(self.nseq[0]); y = np.zeros(self.nseq[1])
        x[i0] = z[:k0]; y[i1] = z[k0:k0 + k1]
        info['min_x'], info['min_y'] = float(x[i0].min()), float(y[i1].min())
        info['value'] = float(-z[k0 + k1 + m0:].dot(self.f[r1]) * -1) if False else float(z[k0 + k1:k0 + k1 + m0] @ self.e[r0])
        s0 = self.to_behavioral(x, 0, sigma)
        s1 = self.to_behavioral(y, 1, s0)
        return s1, info


# ================================================================================================
# Semismooth Levenberg-Marquardt on the sequence-form complementarity system ("CFR + Newton finish")
# ================================================================================================
class NewtonFinish:
    """Equilibrium <=> Phi(z) = 0, z = (x, y, p, q), with
        Phi = [ E x - e ;  F y - f ;  min(x, E^T p - A y) ;  min(y, A^T x - F^T q) ].
    Phi is piecewise linear (hence semismooth).  We run Levenberg-Marquardt
        (J^T J + lam I) d = -J^T Phi,   lam = c * ||Phi||,
    which converges locally quadratically to the (generally non-isolated) solution set under a local
    error bound - and for this polyhedral problem Hoffman's bound provides one.  Warm start: CFR."""

    def __init__(self, sf):
        self.sf = sf
        E, F, A = sf.E, sf.F, sf.A
        self.n0, self.n1 = A.shape
        self.m0, self.m1 = E.shape[0], F.shape[0]
        n0, n1, m0, m1 = self.n0, self.n1, self.m0, self.m1
        Z = lambda a, b: sp.csr_matrix((a, b))
        I0, I1 = sp.identity(n0, format='csr'), sp.identity(n1, format='csr')
        # linear parts
        self.L_E = sp.hstack([E, Z(m0, n1), Z(m0, m0), Z(m0, m1)], format='csr')
        self.L_F = sp.hstack([Z(m1, n0), F, Z(m1, m0), Z(m1, m1)], format='csr')
        self.L_sx = sp.hstack([Z(n0, n0), -A, E.T, Z(n0, m1)], format='csr')      # s_x = E^T p - A y
        self.L_sy = sp.hstack([A.T, Z(n1, n1), Z(n1, m0), -F.T], format='csr')     # s_y = A^T x - F^T q
        self.L_x = sp.hstack([I0, Z(n0, n1), Z(n0, m0), Z(n0, m1)], format='csr')
        self.L_y = sp.hstack([Z(n1, n0), I1, Z(n1, m0), Z(n1, m1)], format='csr')
        self.rhs = np.concatenate([sf.e, sf.f])
        self.N = n0 + n1 + m0 + m1

    def split(self, z):
        n0, n1, m0 = self.n0, self.n1, self.m0
        return z[:n0], z[n0:n0 + n1], z[n0 + n1:n0 + n1 + m0], z[n0 + n1 + m0:]

    def phi_and_jac(self, z):
        x, y, p, q = self.split(z)
        sx = self.L_sx @ z; sy = self.L_sy @ z
        ax = x <= sx; ay = y <= sy                     # which branch of min is active
        phi = np.concatenate([self.L_E @ z - self.sf.e, self.L_F @ z - self.sf.f,
                              np.where(ax, x, sx), np.where(ay, y, sy)])
        Dx = sp.diags(ax.astype(float)); Dy = sp.diags(ay.astype(float))
        Jx = Dx @ self.L_x + sp.diags((~ax).astype(float)) @ self.L_sx
        Jy = Dy @ self.L_y + sp.diags((~ay).astype(float)) @ self.L_sy
        J = sp.vstack([self.L_E, self.L_F, Jx, Jy], format='csr')
        return phi, J

    def warm_start(self, sigma):
        sf = self.sf
        x, y = sf.to_seq(sigma, 0), sf.to_seq(sigma, 1)
        p, q = sf.dual_estimates(sigma)
        return np.concatenate([x, y, p, q])

    def to_sigma(self, z, fallback):
        x, y, _, _ = self.split(z)
        s0 = self.sf.to_behavioral(np.maximum(x, 0), 0, fallback)
        return self.sf.to_behavioral(np.maximum(y, 0), 1, s0)

    def solve(self, sigma, iters=30, c=1e-6, tol=1e-13, verbose=False, track=True, marquardt=True):
        z = self.warm_start(sigma)
        phi, J = self.phi_and_jac(z)
        hist = [(0, float(np.linalg.norm(phi)), self.sf.T.exploitability(self.to_sigma(z, sigma)) if track else None)]
        mu = c
        for k in range(1, iters + 1):
            nphi = np.linalg.norm(phi)
            if nphi < tol:
                break
            lam = mu * nphi
            JtJ = (J.T @ J).tocsc()
            if marquardt:
                dg = JtJ.diagonal(); dg = np.where(dg > 0, dg, 1.0)
                H = (JtJ + lam * sp.diags(dg)).tocsc()
            else:
                H = (JtJ + lam * sp.identity(self.N)).tocsc()
            d = spla.spsolve(H, -(J.T @ phi))
            zn = z + d
            phin, Jn = self.phi_and_jac(zn)
            if np.linalg.norm(phin) < nphi:          # accept; relax damping
                z, phi, J = zn, phin, Jn
                mu = max(mu / 4, 1e-12)
            else:                                    # reject; increase damping
                mu *= 8
            hist.append((k, float(np.linalg.norm(phi)), self.sf.T.exploitability(self.to_sigma(z, sigma)) if track else None))
            if verbose:
                print(k, hist[-1])
        return self.to_sigma(z, sigma), z, hist


# ================================================================================================
# Smoothing Newton (Chen-Harker-Kanzow-Smale) on the sequence-form complementarity system
# ================================================================================================
class SmoothingNewton(NewtonFinish):
    """Replace min(a,b) by the CHKS smoothing  phi_mu(a,b) = a + b - sqrt((a-b)^2 + 4 mu^2)
    (phi_mu = 0  <=>  a, b > 0, ab = mu^2).  For mu > 0 the Jacobian is nonsingular (monotone LCP with
    full-row-rank E, F), so plain Newton steps are well defined; drive mu -> 0 with the residual."""

    def phi_mu(self, z, mu, jac=True):
        x, y, p, q = self.split(z)
        sx = self.L_sx @ z; sy = self.L_sy @ z
        out = [self.L_E @ z - self.sf.e, self.L_F @ z - self.sf.f]
        Js = []
        for a, b, La, Lb in ((x, sx, self.L_x, self.L_sx), (y, sy, self.L_y, self.L_sy)):
            r = np.sqrt((a - b) ** 2 + 4 * mu * mu)
            out.append(a + b - r)
            if jac:
                t = np.where(r > 0, (a - b) / np.where(r > 0, r, 1), 0.0)
                Js.append(sp.diags(1 - t) @ La + sp.diags(1 + t) @ Lb)
        phi = np.concatenate(out)
        if not jac:
            return phi
        return phi, sp.vstack([self.L_E, self.L_F] + Js, format='csc')

    def solve(self, sigma, iters=40, theta=0.1, tol=1e-13, z0=None, verbose=False, track=True):
        z = self.warm_start(sigma) if z0 is None else z0.copy()
        res0 = lambda z: np.linalg.norm(self.phi_and_jac(z)[0])
        r = res0(z)
        hist = [(0, r, self.sf.T.exploitability(self.to_sigma(z, sigma)) if track else None)]
        for k in range(1, iters + 1):
            if r < tol:
                break
            mu = theta * r / np.sqrt(self.N)
            phi, J = self.phi_mu(z, mu)
            d = spla.spsolve(J, -phi)
            t, f0 = 1.0, np.linalg.norm(phi)
            while t > 1e-8 and np.linalg.norm(self.phi_mu(z + t * d, mu, jac=False)) > (1 - 1e-4 * t) * f0:
                t *= 0.5
            z = z + t * d
            r = res0(z)
            hist.append((k, r, self.sf.T.exploitability(self.to_sigma(z, sigma)) if track else None))
            if verbose:
                print(k, f'mu={mu:.1e} t={t:.2g}', hist[-1])
        return self.to_sigma(z, sigma), z, hist


# ================================================================================================
# Proximal point + semismooth Newton (primal-dual active set) on the sequence-form VI
# ================================================================================================
class ProxNewton:
    """The equilibrium is the solution of a monotone affine variational inequality in z = (x, y, p, q):
          x >= 0  _|_  E^T p - A y >= 0,      y >= 0  _|_  A^T x - F^T q >= 0,
          E x = e,   F y = f   (p, q free),
    i.e.  w(z) = M z + b  with  M = [[0,-A,E^T,0],[A^T,0,0,-F^T],[-E,0,0,0],[0,F,0,0]]  SKEW-symmetric.
    Proximal point:  z_{k+1} solves the same VI for  M z + b + rho (z - z_k)  (strongly monotone).
    Each subproblem: semismooth Newton on  Psi(z) = [min(x, w_x); min(y, w_y); w_p; w_q]; for any active set the
    Jacobian is a row-selection of I and (M + rho I), which is nonsingular (P-matrix).  For a polyhedral
    monotone VI the proximal point method converges linearly, and finitely for LP (Rockafellar 1976; Ferris 1991)."""

    def __init__(self, sf):
        self.sf = sf
        E, F, A = sf.E, sf.F, sf.A
        self.n0, self.n1 = A.shape; self.m0, self.m1 = E.shape[0], F.shape[0]
        n0, n1, m0, m1 = self.n0, self.n1, self.m0, self.m1
        self.N = n0 + n1 + m0 + m1
        Z = lambda a, b: sp.csr_matrix((a, b))
        self.M = sp.bmat([[Z(n0, n0), -A, E.T, Z(n0, m1)],
                          [A.T, Z(n1, n1), Z(n1, m0), -F.T],
                          [-E, Z(m0, n1), Z(m0, m0), Z(m0, m1)],
                          [Z(m1, n0), F, Z(m1, m0), Z(m1, m1)]], format='csr')
        self.b = np.concatenate([np.zeros(n0 + n1), sf.e, -sf.f])
        self.nb = n0 + n1                       # bounded (nonnegative) coordinates come first
        self.I = sp.identity(self.N, format='csr')

    def residual(self, z):
        """Natural residual of the unregularised VI (= 0 iff equilibrium)."""
        w = self.M @ z + self.b
        r = w.copy(); r[:self.nb] = np.minimum(z[:self.nb], w[:self.nb])
        return r

    def warm_start(self, sigma):
        sf = self.sf
        x, y = sf.to_seq(sigma, 0), sf.to_seq(sigma, 1)
        p, q = sf.dual_estimates(sigma)
        return np.concatenate([x, y, p, q])

    def to_sigma(self, z, fallback):
        sf = self.sf
        s0 = sf.to_behavioral(np.maximum(z[:self.n0], 0), 0, fallback)
        return sf.to_behavioral(np.maximum(z[self.n0:self.nb], 0), 1, s0)

    def inner(self, zk, rho, z, iters=50, tol=1e-14):
        """Semismooth Newton (PDAS) for the rho-regularised subproblem, started at z."""
        Mr = (self.M + rho * self.I).tocsr()
        br = self.b - rho * zk
        nb = self.nb
        for it in range(iters):
            w = Mr @ z + br
            act = np.zeros(self.N, bool); act[:nb] = z[:nb] <= w[:nb]     # active: x_i = 0
            psi = w.copy(); psi[act] = z[act]
            if np.linalg.norm(psi) < tol:
                break
            # Newton: rows in act -> e_i, others -> rows of Mr
            Dk = sp.diags(act.astype(float)); Dn = sp.diags((~act).astype(float))
            J = (Dk @ self.I + Dn @ Mr).tocsc()
            d = spla.spsolve(J, -psi)
            # backtracking on ||psi||
            t, f0 = 1.0, np.linalg.norm(psi)
            while t > 1e-6:
                zn = z + t * d; wn = Mr @ zn + br
                pn = wn.copy(); pn[:nb] = np.minimum(zn[:nb], wn[:nb])
                if np.linalg.norm(pn) < (1 - 1e-4 * t) * f0:
                    break
                t *= 0.5
            z = zn
        return z, it + 1

    def solve(self, sigma, rho=1e-2, outer=50, tol=1e-13, z0=None, track=True, inner_iters=50, verbose=False):
        import time as _time
        t0 = _time.time()
        z = self.warm_start(sigma) if z0 is None else z0.copy()
        r = np.linalg.norm(self.residual(z))
        self.clock = [_time.time() - t0]          # compute time only (exploitability evaluation excluded)
        hist = [(0, 0, r, self.sf.T.exploitability(self.to_sigma(z, sigma)) if track else None)]
        newton = 0
        for k in range(1, outer + 1):
            if r < tol:
                break
            t1 = _time.time()
            rk = rho(k) if callable(rho) else rho
            z, ni = self.inner(z.copy(), rk, z.copy(), iters=inner_iters)
            newton += ni
            r = np.linalg.norm(self.residual(z))
            self.clock.append(self.clock[-1] + _time.time() - t1)
            hist.append((k, newton, r, self.sf.T.exploitability(self.to_sigma(z, sigma)) if track else None))
            if verbose:
                print(hist[-1], flush=True)
        return self.to_sigma(z, sigma), z, hist


class ProxNewtonFB(ProxNewton):
    """As ProxNewton, but each strongly monotone subproblem is solved by the semismooth Newton method of
    De Luca-Facchinei-Kanzow on the Fischer-Burmeister reformulation
        phi(a, b) = a + b - sqrt(a^2 + b^2)       (phi = 0  <=>  a >= 0, b >= 0, ab = 0),
    whose merit 1/2 ||Phi||^2 is C^1, so an Armijo line search globalises Newton.  For a strongly monotone
    LCP every stationary point of the merit is the solution and the Newton matrices are uniformly
    nonsingular, so convergence is global and locally quadratic.  'scale' balances the two arguments."""

    def __init__(self, sf, scale=1.0):
        super().__init__(sf)
        self.c = scale

    def fb(self, z, Mr, br, jac=True):
        nb, c = self.nb, self.c
        w = Mr @ z + br
        a, b = z[:nb], c * w[:nb]
        r = np.sqrt(a * a + b * b)
        Phi = np.concatenate([a + b - r, w[nb:]])
        if not jac:
            return Phi
        rz = r == 0
        rs = np.where(rz, 1.0, r)
        da = np.where(rz, 1 - 1 / np.sqrt(2), 1 - a / rs)
        db = np.where(rz, 1 - 1 / np.sqrt(2), 1 - b / rs)
        Da = sp.diags(np.concatenate([da, np.zeros(self.N - nb)]))
        Db = sp.diags(np.concatenate([c * db, np.ones(self.N - nb)]))
        return Phi, (Da @ self.I + Db @ Mr).tocsc()

    def inner(self, zk, rho, z, iters=50, tol=1e-14):
        Mr = (self.M + rho * self.I).tocsr()
        br = self.b - rho * zk
        self.steps = getattr(self, 'steps', [])
        for it in range(iters):
            Phi, J = self.fb(z, Mr, br)
            th = 0.5 * Phi @ Phi
            if np.sqrt(2 * th) < tol:
                break
            d = spla.spsolve(J, -Phi)
            t = 1.0
            while t > 1e-10:
                Pn = self.fb(z + t * d, Mr, br, jac=False)
                if 0.5 * Pn @ Pn <= (1 - 2e-4 * t) * th:
                    break
                t *= 0.5
            z = z + t * d
            self.steps.append(t)
        return z, it + 1


class ProxNewtonFBReduced(ProxNewtonFB):
    """ProxNewtonFB with the Newton system reduced to the 'undecided' coordinates.  Rows whose
    Fischer-Burmeister derivative w.r.t. the slack is negligible (x_i = 0 clearly optimal: the sequence is
    dropped from the support) are identity rows; eliminating them leaves a system whose size is the
    support of the current iterate plus the number of information sets.  Poker equilibria are nearly
    pure, so this is far smaller than the full system (and the dense hand-by-hand payoff blocks that
    cause fill-in mostly disappear)."""
    drop = 1e-9

    def inner(self, zk, rho, z, iters=50, tol=1e-14):
        Mr = (self.M + rho * self.I).tocsr()
        br = self.b - rho * zk
        nb, c, N = self.nb, self.c, self.N
        self.steps = getattr(self, 'steps', []); self.sizes = getattr(self, 'sizes', [])
        for it in range(iters):
            w = Mr @ z + br
            a, b = z[:nb], c * w[:nb]
            r = np.sqrt(a * a + b * b)
            Phi = np.concatenate([a + b - r, w[nb:]])
            th = 0.5 * Phi @ Phi
            self.inner_res = getattr(self, 'inner_res', []); self.inner_res.append(float(np.sqrt(2 * th)))
            if np.sqrt(2 * th) < tol:
                self.inner_res.append(None)
                break
            rz = r == 0; rs = np.where(rz, 1.0, r)
            da = np.where(rz, 1 - 1 / np.sqrt(2), 1 - a / rs)
            db = np.where(rz, 1 - 1 / np.sqrt(2), 1 - b / rs)
            da = np.concatenate([da, np.zeros(N - nb)]); db = np.concatenate([c * db, np.ones(N - nb)])
            Aset = db < self.drop                       # identity rows
            Fset = ~Aset
            d = np.zeros(N)
            d[Aset] = -Phi[Aset] / da[Aset]
            MF = Mr[Fset]
            JFF = (sp.diags(da[Fset]) @ self.I[Fset][:, Fset] + sp.diags(db[Fset]) @ MF[:, Fset]).tocsc()
            rhs = -Phi[Fset] - db[Fset] * (MF[:, Aset] @ d[Aset])
            d[Fset] = spla.spsolve(JFF, rhs)
            self.sizes.append(int(Fset.sum()))
            t = 1.0
            while t > 1e-10:
                zn = z + t * d; wn = Mr @ zn + br
                an, bn = zn[:nb], c * wn[:nb]
                Pn = np.concatenate([an + bn - np.sqrt(an * an + bn * bn), wn[nb:]])
                if 0.5 * Pn @ Pn <= (1 - 2e-4 * t) * th:
                    break
                t *= 0.5
            z = zn
            self.steps.append(t)
        return z, it + 1
