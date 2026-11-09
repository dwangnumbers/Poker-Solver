"""Vector extrapolation (RRE / MPE) of the sequence of CFR average strategies, in sequence form.
Affine combinations with weights summing to 1 preserve E x = e exactly; nonnegativity is restored by
clipping (then the behavioural strategy is renormalised)."""
import numpy as np

def rre(X, reg=1e-12):
    """X: (k+2, n) snapshots x_0..x_{k+1}. Returns sum gamma_i x_i with min ||sum gamma_i dx_i||, sum gamma=1."""
    U = np.diff(X, axis=0)                     # (k+1, n)
    G = U @ U.T
    G += reg * np.trace(G) / len(G) * np.eye(len(G))
    w = np.linalg.solve(G, np.ones(len(G)))
    g = w / w.sum()
    return g @ X[:-1], g

def mpe(X, reg=1e-12):
    U = np.diff(X, axis=0)
    k = len(U) - 1
    A = U[:-1].T                               # n x k
    c = np.linalg.lstsq(A.T @ A + reg * np.trace(A.T @ A) / max(k,1) * np.eye(k), -A.T @ U[-1], rcond=None)[0]
    c = np.append(c, 1.0)
    g = c / c.sum()
    return g @ X[:-1], g
