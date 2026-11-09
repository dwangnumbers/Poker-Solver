"""
Support-restricted finish ("prune, solve exactly, verify, repeat").

The proximal subproblems of the full sequence-form VI are ill-conditioned on large spots because the equilibrium set is
flat: actions that are never played, and information sets the opponent never lets you reach, can take any value.
Here we remove those directions explicitly:

  1. From a CFR average, keep the actions played with probability >= tau (the predicted support).
  2. Keep only information sets that BOTH players can reach using kept actions (the opponent's kept actions must be able
     to reach the public node with a compatible hand).  Everything else is fixed to the CFR strategy.
  3. Solve the restricted game's VI to machine precision (proximal point; interior point + crossover; active-set Newton).
  4. Verify in the full game: any pruned action with positive counterfactual regret is a profitable deviation; add it
     (and everything below it) to the kept set and go to 2.  (Column generation / double-oracle style.)
"""
import numpy as np
import scipy.sparse as sp
from types import SimpleNamespace
from seqform import SeqForm, ProxIPMPDAS


def kept_actions(sigma, tau):
    return [s >= tau for s in sigma]


def live_infosets(sf, keep):
    """live[p][node_idx] = boolean vector over p's hands: own kept path reaches the node AND some compatible
    opponent hand reaches it along kept actions."""
    g = sf.g
    C = g.bases['norm'] > 0
    live = [dict(), dict()]

    def rec(node, path):
        if node.kind == 'decision':
            p = node.player
            opp_any = (C @ path[1 - p]) > 0 if p == 0 else (C.T @ path[1 - p]) > 0
            live[p][node.idx] = path[p] & opp_any
            for a, c in enumerate(node.children):
                np_ = [path[0], path[1]]
                np_[p] = path[p] & keep[node.idx][:, a]
                rec(c, np_)
        else:
            for c in node.children:
                rec(c, path)
    rec(g.root, [g.root_reach[0] > 0, g.root_reach[1] > 0])
    return live


def restricted(sf, keep, live):
    """Index sets of the restricted sequence form."""
    g = sf.g
    cols, rows = [], []
    for p, M in ((0, sf.E), (1, sf.F)):
        cs = [0]; rs = [0]
        r = 1
        for ni in sf.infosets[p]:
            n = g.decisions[ni]
            for h in range(g.nh[p]):
                if live[p][ni][h]:
                    rs.append(r)
                    for a in range(len(n.actions)):
                        if keep[ni][h, a]:
                            cs.append(sf.seq(p, ni, h, a))
                r += 1
        cols.append(np.array(sorted(cs))); rows.append(np.array(rs))
    return cols, rows


def solve_support(sf, sigma0, tau=1e-3, rho=1e-5, rounds=6, tol_regret=1e-12, tol=1e-12, verbose=True, log=None):
    """Returns (sigma, info).  sigma0: CFR average (fallback strategy outside the restricted game)."""
    import time
    g = sf.g
    keep = kept_actions(sigma0, tau)
    sigma = [s.copy() for s in sigma0]
    info = []
    t_start = time.time()
    for rnd in range(rounds):
        t0 = time.time()
        live = live_infosets(sf, keep)
        (c0, c1), (r0, r1) = restricted(sf, keep, live)
        # purified warm start: CFR strategy with pruned actions removed
        warm = []
        for i, s in enumerate(sigma):
            t = np.where(keep[i], s, 0.0)
            tot = t.sum(axis=1, keepdims=True)
            warm.append(np.where(tot > 0, t / np.where(tot > 0, tot, 1), s))
        sub = SimpleNamespace(E=sf.E[r0][:, c0].tocsr(), e=sf.e[r0], F=sf.F[r1][:, c1].tocsr(), f=sf.f[r1],
                              A=sf.A[c0][:, c1].tocsr(), T=None, to_behavioral=lambda x, p, fb: fb)
        x = sf.to_seq(warm, 0)[c0]; y = sf.to_seq(warm, 1)[c1]
        p, q = sf.dual_estimates(warm)
        z0 = np.concatenate([x, y, p[r0], q[r1]])
        fin = ProxIPMPDAS(sub)
        _, z, hist = fin.solve(None, rho=rho, z0=z0, track=False, tol=tol, first='ipm' if rnd == 0 else 'pdas')
        n0 = len(c0)
        X = np.zeros(sf.nseq[0]); X[c0] = np.maximum(z[:n0], 0)
        Y = np.zeros(sf.nseq[1]); Y[c1] = np.maximum(z[n0:n0 + len(c1)], 0)
        s0 = sf.to_behavioral(X, 0, warm)
        sigma = sf.to_behavioral(Y, 1, s0)
        expl = sf.T.exploitability(sigma)
        # verification: counterfactual regrets of pruned actions at every infoset reachable by the player itself
        added = 0
        for pl in (0, 1):
            reg = {}
            sf.T.cfv(pl, sigma, regret_out=reg)
            for ni, R in reg.items():
                scale = max(np.abs(R).max(), 1e-300)
                bad = (~keep[ni]) & (R > tol_regret * max(1.0, scale))
                if bad.any():
                    keep[ni] = keep[ni] | bad
                    added += int(bad.sum())
        rec = dict(round=rnd, n_vars=int(fin.N), solves=int(hist[-1][1]), vi=float(hist[-1][2]), expl=float(expl),
                   added=added, time=time.time() - t0, total=time.time() - t_start, log=[str(l) for l in fin.log])
        info.append(rec)
        if log is not None:
            log.append(rec)
        if verbose:
            print(f"round {rnd}: restricted unknowns {fin.N} ({fin.N / (sf.nseq[0] + sf.nseq[1] + sf.E.shape[0] + sf.F.shape[0]):.0%}), "
                  f"{rec['solves']} solves, VI {rec['vi']:.1e}, full-game exploitability {expl:.2e}, "
                  f"added {added} actions, {rec['time']:.1f}s", flush=True)
            print('   prox steps:', ' '.join(f'{l[1]}:{l[2]}' for l in fin.log), flush=True)
        if added == 0:
            break
    return sigma, info
