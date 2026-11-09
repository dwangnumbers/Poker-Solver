"""Sanity tests (about 15 s):  python3 test_solver.py   (or pytest test_solver.py)"""
import warnings
import numpy as np
warnings.filterwarnings('ignore')
from games import kuhn, leduc, river, card, eval7, expand_range, BB_CALL, BTN_OPEN
from cfr import solve
from seqform import SeqForm, ProxIPMPDAS
from lp import solve_lp
from bench_river import SMALL

def ev(cs):
    return eval7([card(c) for c in cs.split()])

def test_evaluator():
    assert ev('As Ks Qs Js Ts 2d 3c') > ev('9h 9d 9s 9c Kd 2c 3h')           # royal flush > quads
    assert ev('9h 9d 9s 9c Kd 2c 3h') > ev('Kh Kd Ks 2c 2d 7h 8s')           # quads > full house
    assert ev('Kh Kd Ks 2c 2d 7h 8s') > ev('Ah Th 7h 4h 2h Kd Qc')           # full house > flush
    assert ev('Ah Th 7h 4h 2h Kd Qc') > ev('5c 4d 3h 2s As Kd Qc')           # flush > straight (wheel)
    assert ev('6c 5d 4h 3s 2c Kd Qc') > ev('5c 4d 3h 2s As Kd Qc')           # 6-high straight > wheel
    assert ev('Ac Ad Kh Ks 2c 3d 7h') > ev('Ac Ad Qh Qs Kc 3d 7h')           # two pair ranking
    assert ev('Ac Ad Kh 9s 2c 3d 7h') == ev('Ah As Kd 9c 2d 3h 7c')          # suits do not matter

def test_ranges():
    assert len(expand_range('22+')) == 13 and len(expand_range('A2s+')) == 12 and len(expand_range('KTo+')) == 3
    assert len(expand_range(BB_CALL)) == 86 and len(expand_range(BTN_OPEN)) == 65
    g = river(ranges=[BB_CALL, BTN_OPEN])
    assert g.nh == [473, 328]

def finish(g, warm):
    T, R, S, h = solve(g, 'dcfr', iters=warm, log_every=warm)
    sf = SeqForm(g)
    sigma, z, hist = ProxIPMPDAS(sf).solve(T.normalize_avg(S), rho=1e-5, track=False)
    return sf, sigma

def test_kuhn():
    sf, sigma = finish(kuhn(), 100)
    assert sf.T.exploitability(sigma) < 1e-13
    assert abs(sf.T.game_value(sigma) + 1 / 18) < 1e-12
    alpha = sigma[0][0][1]                              # first player bets the jack with probability alpha
    assert 0 <= alpha <= 1 / 3 + 1e-12 and abs(sigma[0][2][1] - 3 * alpha) < 1e-9

def test_leduc_matches_lp():
    sf, sigma = finish(leduc(), 100)
    *_, v0, v1 = solve_lp(sf)
    assert abs(v0 - v1) < 1e-9
    assert sf.T.exploitability(sigma) < 1e-12
    assert abs(sf.T.game_value(sigma) - v0) < 1e-10

def test_river_matches_lp():
    sf, sigma = finish(river(**SMALL), 1000)
    *_, v0, v1 = solve_lp(sf)
    assert sf.T.exploitability(sigma) < 1e-12
    assert abs(sf.T.game_value(sigma) - v0) < 1e-9

def test_cfr_converges():
    g = leduc()
    for algo in ('cfr', 'cfr+', 'dcfr', 'pcfr+'):
        T, R, S, h = solve(g, algo, iters=300, log_every=300)
        assert h[-1][1] < 0.1 and h[-1][1] < h[0][1]

if __name__ == '__main__':
    for name, f in list(globals().items()):
        if name.startswith('test_'):
            f(); print('ok', name)
