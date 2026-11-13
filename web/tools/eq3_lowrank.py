"""Symmetric low-rank factors of the three-way equity tensor (python3 web/tools/eq3_lowrank.py [R]).

For each hero class i, F_i(j, k) = all-in equity of i against classes j and k is a symmetric 169 x 169 matrix.
Its eigen-decomposition F_i = sum_r lambda_r u_r u_r^T is truncated to the R eigenvalues of largest modulus, so that a
three-way showdown costs 2 * 169 * R multiplications per hero class instead of 169^2. Writes data/eq3r.f32 as
[R, lambda (169 x R), U (169 x R x 169)] and prints the truncation error for a range of ranks.
"""
import pathlib
import sys
import numpy as np

data = pathlib.Path(__file__).resolve().parent.parent / "data"
R = int(sys.argv[1]) if len(sys.argv) > 1 else 16
raw = np.fromfile(data / "eq3.u16", dtype=np.uint16).astype(np.float64).reshape(-1, 3) / 65535.0
idx = {}
t = 0
for a in range(169):
    for b in range(a, 169):
        for c in range(b, 169):
            idx[(a, b, c)] = t
            t += 1
F = np.zeros((169, 169, 169))
for (a, b, c), t in idx.items():
    e = raw[t]
    for (x, y, z), ex in (((a, b, c), e[0]), ((b, a, c), e[1]), ((c, a, b), e[2])):
        F[x, y, z] = ex
        F[x, z, y] = ex
# report errors: relative Frobenius error of F_i, and of the contraction a^T F_i b for random nonnegative ranges
rng = np.random.default_rng(1)
A = rng.random((169, 20)) * (rng.random((169, 20)) < 0.4)
B = rng.random((169, 20)) * (rng.random((169, 20)) < 0.4)
lam_all, U_all = [], []
for i in range(169):
    w, V = np.linalg.eigh(F[i])
    order = np.argsort(-np.abs(w))
    lam_all.append(w[order])
    U_all.append(V[:, order])
print("rank  rel. Frobenius error (max over i)  rel. contraction error (max)")
for r in (1, 2, 4, 6, 8, 12, 16, 24, 32):
    ef, ec = 0.0, 0.0
    for i in range(169):
        w, V = lam_all[i][:r], U_all[i][:, :r]
        Fr = (V * w) @ V.T
        ef = max(ef, np.linalg.norm(F[i] - Fr) / np.linalg.norm(F[i]))
        exact = np.einsum("jn,jk,kn->n", A, F[i], B)
        approx = np.einsum("jn,jk,kn->n", A, Fr, B)
        ec = max(ec, np.max(np.abs(exact - approx) / np.abs(exact)))
    print(f"{r:4d}  {ef:.3e}  {ec:.3e}")
lam = np.array([l[:R] for l in lam_all], dtype=np.float32)
U = np.array([u[:, :R].T for u in U_all], dtype=np.float32)          # (169, R, 169)
out = np.concatenate([[np.float32(R)], lam.ravel(), U.ravel()]).astype(np.float32)
out.tofile(data / "eq3r.f32")
print("wrote", data / "eq3r.f32", out.nbytes // 1024, "kB, rank", R)
