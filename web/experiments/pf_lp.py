"""Heads-up push or fold as a linear program on the same tables (exact equilibrium of the class-level game).
python3 pf_lp.py -> out/pf_lp.json"""
import json, pathlib
import numpy as np
from scipy.optimize import linprog
d = pathlib.Path(__file__).resolve().parent.parent / "data"
C2 = np.fromfile(d / "c2.u16", dtype=np.uint16).astype(float).reshape(169, 169)
E2 = np.fromfile(d / "eq2.f32", dtype=np.float32).astype(float).reshape(169, 169)
res = {}
for S in (5, 10, 15, 20):
    # SB payoff: fold -0.5; push and BB folds +1; push and call: 2S*E - S
    # U(x, y) = sum_ij C2_ij [ (1 - x_i)(-0.5) + x_i (1 - y_j) + x_i y_j (2S E_ij - S) ]
    #         = a(x) + sum_j y_j b_j(x),  a(x) = sum_ij C2_ij (-0.5 + 1.5 x_i),  b_j(x) = sum_i C2_ij x_i (2S E_ij - S - 1)
    A = C2.sum(axis=1)                       # coefficient of x_i in a: 1.5 * A_i, constant -0.5 * total
    B = C2 * (2 * S * E2 - S - 1)            # b_j(x) = sum_i B_ij x_i
    n = 169
    # variables [x (169), z (169)], maximise 1.5 A.x + sum z  s.t. z_j <= 0, z_j - B[:, j].x <= 0
    c = -np.concatenate([1.5 * A, np.ones(n)])
    Aub = np.hstack([-B.T, np.eye(n)])
    r = linprog(c, A_ub=Aub, b_ub=np.zeros(n), bounds=[(0, 1)] * n + [(None, 0)] * n, method="highs")
    val = (-r.fun - 0.5 * C2.sum()) / C2.sum()
    x = r.x[:n]
    cnt = np.array([6 if i // 13 == i % 13 else 4 if i // 13 < i % 13 else 12 for i in range(169)])
    res[S] = {"sbValue": val, "push": float((cnt * x).sum() / 1326)}
    print(S, "bb: LP value", round(val, 6), "push", round(100 * res[S]["push"], 1))
(pathlib.Path(__file__).parent / "out" / "pf_lp.json").write_text(json.dumps(res))
