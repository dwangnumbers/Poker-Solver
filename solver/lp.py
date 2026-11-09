"""Exact sequence-form LP (HiGHS) - reference solution for small games."""
import numpy as np, scipy.sparse as sp
from scipy.optimize import linprog

def solve_lp(sf):
    E, e, F, f, A = sf.E, sf.e, sf.F, sf.f, sf.A
    n0, n1 = A.shape; m0, m1 = E.shape[0], F.shape[0]
    # player 0: max f^T q  s.t.  -A^T x + F^T q <= 0,  E x = e,  x >= 0, q free
    c = np.concatenate([np.zeros(n0), -f])
    Aub = sp.hstack([-A.T, F.T]); bub = np.zeros(n1)
    Aeq = sp.hstack([E, sp.csr_matrix((m0, m1))])
    b = [(0, None)] * n0 + [(None, None)] * m1
    r0 = linprog(c, A_ub=Aub, b_ub=bub, A_eq=Aeq, b_eq=e, bounds=b, method='highs')
    x, q = r0.x[:n0], r0.x[n0:]
    # player 1: min e^T p  s.t.  A y - E^T p <= 0,  F y = f,  y >= 0, p free
    c = np.concatenate([np.zeros(n1), e])
    Aub = sp.hstack([A, -E.T]); bub = np.zeros(n0)
    Aeq = sp.hstack([F, sp.csr_matrix((m1, m0))])
    b = [(0, None)] * n1 + [(None, None)] * m0
    r1 = linprog(c, A_ub=Aub, b_ub=bub, A_eq=Aeq, b_eq=f, bounds=b, method='highs')
    y, p = r1.x[:n1], r1.x[n1:]
    return x, y, p, q, -r0.fun, r1.fun
