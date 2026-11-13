"""Figures (../figs) and tables (data/*.tex) for talk.tex from ../web/experiments/out/*.json.

    python3 make_talk_data.py
"""
import json
import math
import pathlib
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = pathlib.Path(__file__).resolve().parent
out = here.parent / "web" / "experiments" / "out"
figs = here.parent / "figs"
data = here / "data"
data.mkdir(exist_ok=True)
COL = {"CFR": "#2A78D6", "CFR+": "#EB6834", "DCFR": "#1BAF7A", "float32": "#1BAF7A", "float64": "#2A78D6"}
plt.rcParams.update({"font.family": "sans-serif", "font.size": 9, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#52514E", "axes.labelcolor": "#0B0B0B", "xtick.color": "#52514E", "ytick.color": "#52514E",
                     "axes.grid": True, "grid.color": "#E4E3DF", "grid.linewidth": 0.6, "legend.frameon": False})
macros = {}


def load(name):
    p = out / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else None


def sci(x, d=1):
    if x == 0:
        return "0"
    e = int(math.floor(math.log10(abs(x))))
    m = x / 10 ** e
    if -2 <= e <= 2:
        return f"{x:.{max(0, d - e)}f}" if e < 1 else f"{x:.{d}f}"
    return f"{m:.{d}f}\\times10^{{{e}}}"


def table(name, header, rows, align):
    s = "\\begin{tabular}{" + align + "}\n\\toprule\n" + " & ".join(header) + " \\\\ \\midrule\n"
    s += "\n".join(" & ".join(r) + " \\\\" for r in rows) + "\n\\bottomrule\n\\end{tabular}\n"
    (data / f"{name}.tex").write_text(s)


def slope(pts, frac=10):
    """least-squares slope of log(expl) against log(T) over [T/frac, T], with its regression standard error"""
    pts = [p for p in pts if p[1] > 0]
    T = pts[-1][0]
    q = [p for p in pts if p[0] >= T / frac]
    x = np.log([p[0] for p in q]); y = np.log([p[1] for p in q])
    A = np.vstack([x, np.ones_like(x)]).T
    coef, res, *_ = np.linalg.lstsq(A, y, rcond=None)
    r = y - A @ coef
    se = math.sqrt((r @ r) / max(1, len(x) - 2) / ((x - x.mean()) @ (x - x.mean())))
    return coef[0], se, len(x)


# ---- convergence
conv = {s: load(f"conv_{s}") for s in ("river", "turn", "flop")}
fig, axes = plt.subplots(1, 3, figsize=(8.4, 2.5))
slopes = []
for ax, (key, d) in zip(axes, conv.items()):
    if not d:
        continue
    for name, pts in d["series"].items():
        ax.loglog([p[0] for p in pts], [p[1] for p in pts], color=COL[name], lw=1.6, label=name)
    ax.axhline(0.3, color="#EDA100", lw=0.9, ls="--")
    ax.set_title(d["name"], fontsize=9)
    ax.set_xlabel("iterations")
    if key == "river":
        ax.set_ylabel("exploitability, % of pot")
        ax.legend(fontsize=8)
    for name, pts in d["series"].items():
        ss = [slope(pts, f)[0] for f in (5, 10, 20)]
        slopes.append((key, name, min(ss), max(ss)))
        last = pts[-1]
        macros[f"Conv{key.capitalize()}{name.replace('+', 'p')}"] = "$" + sci(last[1], 1) + "$"
    dc = d["series"].get("DCFR")
    if dc:
        hit = next((p[0] for p in dc if p[1] <= 0.3), None)
        macros[f"Conv{key.capitalize()}DCFRtarget"] = str(hit) if hit else "more than " + str(dc[-1][0])
fig.tight_layout()
fig.savefig(figs / "conv_streets.pdf")
plt.close(fig)
by = {}
for key, name, lo, hi in slopes:
    by.setdefault(name, []).append(f"[{lo:.1f}, {hi:.1f}]")
macros["ConvSlopes"] = "; ".join(f"{n.replace('+', '$^+$')} ${', '.join(v)}$" for n, v in by.items()) + " for river, turn and flop"

# ---- leaf cost
lc = load("leafcost")
if lc:
    rows = [[str(r["n"]), f"{r['fold_us']:.1f}", f"{r['sweep_us']:.1f}", f"{r['direct_us']:.0f}"] for r in lc]
    table("leaf_table", ["$n$", "fold", "showdown", "direct"], rows, "rrrr")
    macros["LeafErr"] = "$" + sci(max(r["maxRelErr"] for r in lc), 0) + "$"

# ---- scaling and sizes
sc = load("scaling")
if sc:
    rows = []
    for r in sc:
        rows.append([r["name"], f"{r['decisions']:,}", sci(r["work"], 1) if r["work"] > 1e5 else f"{r['work']:,}",
                     f"{r['memMB']:.0f}" if r["memMB"] >= 1 else f"{r['memMB']:.2f}", f"{r['msPerIter']:.0f}" if r["msPerIter"] >= 10 else f"{r['msPerIter']:.1f}",
                     f"{1e6 * r['msPerIter'] / r['work']:.0f}"])
    rows = [[c if not c.startswith(("1", "2", "3", "4", "5", "6", "7", "8", "9")) or "times" not in c else f"${c}$" for c in r] for r in rows]
    table("scaling_table", ["tree", "decisions", "$\\sum n_p|A|$", "MB", "ms per iteration", "ns per entry"], rows, "lrrrrr")
    big = [r for r in sc if r["work"] > 1e6]
    macros["NsPerWork"] = f"{np.median([1e6 * r['msPerIter'] / r['work'] for r in big]):.0f}"
    small = [r for r in sc if r["name"] in ("river, 2 sizes, raises", "turn, raises and all-in", "flop, 1 size per street")]
    rows = [[r["name"].split(",")[0], f"{r['decisions']:,}", str(r["n"][0]) + " / " + str(r["n"][1])] for r in small]
    table("size_table", ["street", "decision nodes", "hands"], rows, "lrr")

# ---- memory by tree (flop K72) from the estimator
me = load("memest")
if me:
    table("mem_table", ["flop", "turn", "river", "MB"], [[r["flop"], r["turn"], r["river"], f"{r['MB']:,.0f}"] for r in me], "lllr")

# ---- precision
pr = load("precision")
if pr and "float32" in next(iter(pr.values())):
    fig, ax = plt.subplots(figsize=(3.6, 2.6))
    for name, d in pr.items():
        ls = "-" if "small" in name else "--"
        for k in ("float32", "float64"):
            pts = d[k]
            ax.loglog([p[0] for p in pts], [p[1] for p in pts], color=COL[k], ls=ls, lw=1.4, label=f"{k}, {'small turn game' if 'small' in name else 'turn spot'}")
    ax.set_xlabel("iterations")
    ax.set_ylabel("exploitability, % of pot")
    ax.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(figs / "precision.pdf")
    plt.close(fig)
    small = next(v for k, v in pr.items() if "small" in k)
    turn = next(v for k, v in pr.items() if "small" not in k)
    macros["PrecSmallFthirtytwo"] = "$" + sci(small["float32"][-1][1], 1) + "$"
    macros["PrecSmallFsixtyfour"] = "$" + sci(small["float64"][-1][1], 1) + "$"
    macros["PrecTurnFthirtytwo"] = f"{turn['float32'][-1][1]:.3f}"
    macros["PrecTurnFsixtyfour"] = f"{turn['float64'][-1][1]:.3f}"

# ---- parallel
pa = load("parallel")
if pa:
    rows = []
    for spot in ("turn", "flop"):
        rs = [r for r in pa["rows"] if r["spot"] == spot]
        if not rs:
            continue
        rows.append([spot, f"{rs[0]['msSeq']:.0f}"] + [f"{r['msPool']:.0f}" for r in rs] + [f"{rs[0]['msSeq'] / rs[-1]['msPool']:.2f}", "yes" if all(r["equal"] for r in rs) else "no"])
    table("parallel_table", ["spot", "sequential", "$P=1$", "$P=2$", "speedup", "same iterates"], rows, "lrrrrr")
    macros["ParCores"] = str(pa["cores"])

# ---- lock
lk = load("lock")
if lk and "pts" in lk:
    b, a = lk["before"], lk["after"]
    bi = next(i for i, x in enumerate(b["acts"]) if x.startswith("bet"))
    fi = next(i for i, x in enumerate(b["oopActs"]) if x.startswith("fold"))
    macros["LockBetBefore"] = f"{100 * b['ip'][bi]:.1f}\\%"
    macros["LockFoldBefore"] = f"{100 * b['oop'][fi]:.1f}\\%"
    macros["LockFoldAfter"] = f"{100 * a['oop'][fi]:.1f}\\%"
    macros["LockValBefore"] = f"{lk['base']['val'][0]:.2f}"
    macros["LockValAfter"] = f"{lk['pts'][-1][2]:.2f}"
    macros["LockBetLabel"] = "bet a third of the pot"

# ---- report subsets
rp = load("reportsub")
if rp:
    rows = [[str(r["n"]), f"{r['oopValue']:.3f}", f"{100 * r['oopBetFreq']:.1f}\\%"] for r in rp["rows"]]
    table("report_table", ["flops", "big blind value", "big blind bets"], rows, "rrr")

# ---- preflop heads-up
hu, lp = load("pf_hu"), load("pf_lp")
if hu and lp:
    rows = [[f"{s} bb", f"{lp[s]['sbValue']:.5f}", f"{hu[s]['sbValue']:.5f}", f"{100 * hu[s]['push']:.1f}\\%", f"{100 * hu[s]['call']:.1f}\\%"] for s in ("5", "10", "15", "20")]
    table("pf_table", ["stack", "LP value", "DCFR value", "push", "call"], rows, "rrrrr")
mu = load("pf_multi")
if mu:
    short = {"3-handed push or fold, 12 bb": "3 players, push/fold", "6-max push or fold, 10 bb": "6 players, push/fold",
             "6-max, 20 bb, raise or shove": "6 players, 20 bb", "6-max, 100 bb": "6 players, 100 bb"}
    rows = [[short.get(k, k), f"{v['decisions']:,}", f"{v['msPerIter']:.0f}", str(v["pts"][-1][0]), "$" + sci(v["pts"][-1][1], 1) + "$"] for k, v in mu.items()]
    table("pf_multi_table", ["game", "nodes", "ms/it.", "iter.", "NashConv"], rows, "lrrrr")
    fig, ax = plt.subplots(figsize=(3.6, 2.4))
    cols = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100"]
    for c, (k, v) in zip(cols, mu.items()):
        ax.loglog([p[0] for p in v["pts"]], [p[1] for p in v["pts"]], color=c, lw=1.4, label=k)
    ax.set_xlabel("iterations")
    ax.set_ylabel("NashConv, bb per hand")
    ax.legend(fontsize=6.5)
    fig.tight_layout()
    fig.savefig(figs / "pf_multi.pdf")
    plt.close(fig)
# low-rank errors (from tools/eq3_lowrank.py)
lr = [(1, 1.874e-01, 1.626e-02), (4, 1.383e-01, 6.343e-03), (8, 1.041e-01, 4.777e-03), (16, 5.850e-02, 2.698e-03), (32, 4.734e-02, 2.485e-03)]
table("lowrank_table", ["$R$", "slice error", "contraction error"], [[str(r), f"${sci(a, 1)}$", f"${sci(b, 1)}$"] for r, a, b in lr], "rrr")
c2 = np.fromfile(here.parent / "web" / "data" / "c2.u16", dtype=np.uint16).astype(float).reshape(169, 169)
cnt = np.array([6 if i // 13 == i % 13 else 4 if i // 13 < i % 13 else 12 for i in range(169)], dtype=float)
M = c2 / np.outer(cnt, cnt)
macros["DDensity"] = f"{100 * np.mean(M < 1 - 1e-12):.0f}\\%"



# =====================================================================================  second round of results
def mac(k, v):
    macros[k] = v


def pm(v, e, d=3):
    return f"{v:.{d}f} $\\pm$ {e:.{d}f}"


# sizes of the convergence spots
cs = {st: load(f"convspots_{st}") for st in ("river", "turn", "flop")}
rows = []
for st in ("river", "turn", "flop"):
    if cs[st]:
        r = cs[st][0]
        rows.append([st, f"{r['decisions']:,}", f"{r['n'][0]} / {r['n'][1]}"])
if rows:
    table("size_table", ["street", "decision nodes", "hands"], rows, "lrr")
# iterations to tolerance
rows = []
for st in ("river", "turn", "flop"):
    if not cs[st]:
        continue
    cells = [st, str(len(cs[st]))]
    for t in ("1", "0.3", "0.1"):
        its = [r["hit"].get(t) for r in cs[st]]
        ok = [i for i in its if i is not None]
        if len(ok) < len(its):
            cells.append(f"{int(np.median(ok)) if ok else '--'} ({len(its) - len(ok)} not reached)" if ok else "not reached")
        else:
            cells.append(f"{int(np.median(ok))} ({min(ok)}--{max(ok)})")
    rows.append(cells)
if rows:
    table("tol_table", ["street", "spots", "1\\%", "0.3\\%", "0.1\\%"], rows, "lrrrr")
if cs["flop"]:
    d = cs["flop"][0]
    mac("FlopInfosets", sci(d["decisions"] * (d["n"][0] + d["n"][1]) / 2, 1))

# cost model: leaf constants from the micro-benchmark (two traversals per iteration), decision and chance constants
# fitted by nonnegative least squares on relative residuals, over trees that take at least 5 ms per iteration
sc = load("scaling")
lcb = load("leafcost")
if sc and "foldWork" in sc[0] and lcb:
    from scipy.optimize import nnls
    big = max(lcb, key=lambda r: r["n"])
    b_ = 2e-3 * big["sweep_us"] / big["n"]          # ms per hand and showdown leaf, per iteration
    c_ = 2e-3 * big["fold_us"] / big["n"]
    fit = [r for r in sc if r["msPerIter"] >= 5]
    X = np.array([[r["work"], r["chanceWork"]] for r in fit], float)
    y = np.array([r["msPerIter"] - b_ * r["showWork"] - c_ * r["foldWork"] for r in fit], float)
    w = 1 / np.array([r["msPerIter"] for r in fit])
    coef, _ = nnls(X * w[:, None], y * w)
    def model(r):
        return coef[0] * r["work"] + coef[1] * r["chanceWork"] + b_ * r["showWork"] + c_ * r["foldWork"]
    rel = np.array([abs(model(r) - r["msPerIter"]) / r["msPerIter"] for r in fit])
    mac("CostA", f"{1e6 * coef[0]:.1f}"); mac("CostB", f"{1e6 * b_:.0f}"); mac("CostC", f"{1e6 * c_:.0f}"); mac("CostD", f"{1e6 * coef[1]:.1f}")
    mac("CostTrees", str(len(fit)))
    spreads = [(max(r["blocks"]) - min(r["blocks"])) / r["msPerIter"] for r in fit if "blocks" in r]
    if spreads:
        mac("CostSpread", f"{100 * max(spreads):.0f}\\%"); mac("CostResid", f"{100 * rel.max():.0f}\\%")
    rows = [[r["name"], f"{r['decisions']:,}", f"{r['msPerIter']:.0f}", f"{model(r):.0f}"] for r in fit]
    table("cost_table", ["tree", "decisions", "measured", "model"], rows, "lrrr")
    fl = next((r for r in sc if r["name"] == "flop, 1 size per street"), None)
    if fl:
        mac("FlopShowLeaves", f"{fl['showLeaves']:,}".replace(",", "{,}"))
        share = (b_ * fl["showWork"] + c_ * fl["foldWork"]) / fl["msPerIter"]
        mac("FlopLeafShare", f"{100 * share:.0f}\\%")
    sc_coef = coef
rf = load("roofline")
if rf:
    mac("RoofUpdNs", f"{rf['updateNsPerEntry']:.1f}")
    mac("RoofCopyGBs", f"{rf['copyGBs']:.1f}")
    if sc and "foldWork" in sc[0]:
        mac("RoofRatio", f"{1e6 * sc_coef[0] / rf['updateNsPerEntry']:.0f}")

# precision, four combinations
pr = load("precision")
if pr and "R32 S32" in next(iter(pr.values())):
    fig, ax = plt.subplots(figsize=(3.7, 2.7))
    cols = {"R32 S32": "#1BAF7A", "R64 S64": "#2A78D6", "R32 S64": "#EB6834", "R64 S32": "#EDA100"}
    for name, d in pr.items():
        ls = "-" if "small" in name else "--"
        for k, c in cols.items():
            pts = d[k]
            ax.loglog([p[0] for p in pts], [p[1] for p in pts], color=c, ls=ls, lw=1.3, label=k if "small" in name else None)
    ax.set_xlabel("iterations")
    ax.set_ylabel("exploitability, % of pot")
    ax.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(figs / "precision.pdf")
    plt.close(fig)
    small = pr["small turn game"]
    fin = [small[k][-1][1] for k in cols]
    mac("PrecFloor", "$" + sci(min(fin), 0) + "$")
    mac("PrecDiff", "$" + sci(small["weightedStrategyDiff"], 1) + "$" + (" on the small game and $" + sci(pr["turn spot"]["weightedStrategyDiff"], 1) + "$ on the turn spot" if "turn spot" in pr and "weightedStrategyDiff" in pr["turn spot"] else ""))

# parallel: measured in Chrome (the site's environment); model T(P) = t_c + ceil(K/P) t_1 calibrated on P = 1
pb, pa = load("parallel_browser"), load("parallel")
if pb:
    rows = []
    for r in pb:
        Kc = 52 - (4 if r["spot"] == "turn" else 3)
        tc = 0.5
        t1 = (r["P1"] - tc) / Kc
        model = lambda P: tc + math.ceil(Kc / P) * t1
        rows.append([r["spot"], f"{r['seq']:.0f}", f"{r['P1']:.0f}", f"{r['P2']:.0f}", f"{model(2):.0f}", f"{r['seq'] / r['P2']:.1f}"])
        if r["spot"] == "flop":
            mac("ParPredEight", f"{model(8):.0f}"); mac("ParEff", f"{100 * model(2) / r['P2']:.0f}\\%")
    table("parallel_table", ["spot", "seq.", "$P=1$", "$P=2$", "model", "speedup"], rows, "lrrrrr")
if pa:
    mac("ParCores", str(pa["cores"]))
    mac("ParBytes", f"{max(r['bytesPerPassPerWorker'] for r in pa['rows']) / 1024:.0f} kB")
    rel = [abs(r["explSeq"] - r["explPool"]) / abs(r["explSeq"]) for r in pa["rows"]]
    mac("ParAgree", "$" + sci(max(max(rel), 1e-16), 0) + "$")
    fl = {r["K"]: r for r in pa["rows"] if r["spot"] == "flop"}
    if 1 in fl:
        mac("ParNodeOverhead", f"{100 * (fl[1]['msPool'] / fl[1]['msSeq'] - 1):.0f}\\%")

# validation numbers
ro, tl, fp = load("river_old"), load("turn_lp"), load("flop_lp")
if ro:
    mac("RiverOldNew", "$" + sci(ro["newExpl"], 2) + "$"); mac("RiverOldOld", "$" + sci(ro["oldExpl"], 2) + "$")
if tl:
    mac("TurnLP", f"{tl['lp']:.8f}"); mac("TurnJS", f"{tl['js'][-1]['value0']:.8f}"); mac("TurnHands", f"{tl['hands'][0]} and {tl['hands'][1]}")
if fp:
    mac("FlopLP", f"{fp['lp']:.6f}"); mac("FlopJS", f"{fp['js'][-1]['value0']:.6f}"); mac("FlopHands", f"{fp['hands'][0]} and {fp['hands'][1]}")

# lock
lk = load("lock")
if lk and "itBefore" in lk:
    mac("LockItBefore", str(lk["itBefore"])); mac("LockItAfter", str(lk["itAfter"]))
    mac("LockValAfter", f"{lk['valAfter']:.1f}"); mac("LockValBefore", f"{lk['base']['val'][0]:.1f}")
    mac("LockFoldAfter", f"{100 * lk['after']['oop'][lk['foldIdx']]:.0f}\\%")
    mac("LockFoldBefore", f"{100 * lk['before']['oop'][lk['foldIdx']]:.0f}\\%")
    mac("LockBetBefore", f"{100 * lk['before']['ip'][lk['betIdx']]:.0f}\\%")

# report with collapsed-strata standard errors
rp = load("reportsub")
if rp and rp["rows"] and "flops" in rp["rows"][0]:
    rows = []
    for r in rp["rows"]:
        fl = r["flops"]
        W = sum(f["w"] for f in fl)
        def est(key):
            m = sum(f["w"] * f[key] for f in fl) / W
            # collapsed strata: neighbouring pieces of the same group are paired
            var = 0.0
            bygroup = {}
            for f in fl:
                bygroup.setdefault(f["group"], []).append(f)
            for g in bygroup.values():
                for i in range(0, len(g) - 1, 2):
                    a, b = g[i], g[i + 1]
                    var += ((a["w"] + b["w"]) / W) ** 2 * (a[key] - b[key]) ** 2 / 4
            return m, math.sqrt(var)
        v, ve = est("val0")
        b_, be = est("oopBet")
        rows.append([str(r["n"]), pm(v, ve, 3), pm(100 * b_, 100 * be, 1) + "\\%"])
    table("report_table", ["flops", "big blind value", "big blind bets"], rows, "rrr")

# preflop sensitivity
ps = load("pf_sens")
if ps:
    mac("SensRms", "$" + sci(ps["rmsTableDiff"], 1) + "$"); mac("SensMax", "$" + sci(ps["maxTableDiff"], 1) + "$")
    rows = [[f"{r['stack']} bb", f"{r['valA']:.5f}", f"{r['valB']:.5f}", f"{abs(r['valA'] - r['valB']):.1e}", f"{100 * abs(r['pushA'] - r['pushB']):.2f}", f"{2 * r['stack'] * ps['maxTableDiff']:.2f}"] for r in ps["rows"]]
    table("sens_table", ["stack", "value, table 1", "value, table 2", "difference", "push change, points", "bound $\\delta$"], rows, "rrrrrr")
lr = load("lowrank")
if lr:
    table("lowrank_table", ["$R$", "slice error", "contraction error"], [[str(r["rank"]), f"${sci(r['sliceError'], 1)}$", f"${sci(r['contractionError'], 1)}$"] for r in lr["rows"] if r["rank"] in (1, 4, 8, 16, 32)], "rrr")
    mac("LowRankErr", "$" + sci(next(r for r in lr["rows"] if r["rank"] == 16)["contractionError"], 1) + "$")

# =====================================================================================  third round
# cost model: T = a W_dec + b W_show, with W_show the showdown work actually evaluated per iteration (instrumented
# engine); fold and chance work are nearly collinear with these and are absorbed. NNLS on relative residuals, with
# leave-one-out predictions.
if sc and "evShow" in sc[0]:
    from scipy.optimize import nnls
    fit = [r for r in sc if r["msPerIter"] >= 5]
    X = np.array([[r["work"], r["evShow"]] for r in fit], float)
    y = np.array([r["msPerIter"] for r in fit]); w = 1 / y
    coef = nnls(X * w[:, None], y * w)[0]
    pred = X @ coef
    loo = []
    for k in range(len(fit)):
        m = np.ones(len(fit), bool); m[k] = False
        loo.append(X[k] @ nnls(X[m] * w[m, None], y[m] * w[m])[0])
    mac("CostA", f"{1e6 * coef[0]:.0f}"); mac("CostB", f"{1e6 * coef[1]:.0f}")
    mac("CostTrees", str(len(fit)))
    spreads = [(max(r["blocks"]) - min(r["blocks"])) / r["msPerIter"] for r in fit if "blocks" in r]
    if spreads:
        mac("CostSpread", f"{100 * max(spreads):.0f}\\%")
    mac("CostResid", f"{100 * np.max(np.abs(pred - y) / y):.0f}\\%")
    mac("CostLoo", f"{100 * np.max(np.abs(np.array(loo) - y) / y):.0f}\\%")
    rows = [[r["name"], f"{r['decisions']:,}", f"{r['msPerIter']:.0f}", f"{pp:.0f}", f"{l:.0f}"] for r, pp, l in zip(fit, pred, loo)]
    table("cost_table", ["tree", "decisions", "measured", "model", "held out"], rows, "lrrrr")
    fl = next((r for r in sc if r["name"] == "flop, 1 size per street"), None)
    if fl:
        mac("FlopLeafShare", f"{100 * coef[1] * fl['evShow'] / fl['msPerIter']:.0f}\\%")
        mac("FlopShowEval", f"{fl['evShow'] / ((fl['n'][0] + fl['n'][1]) / 2) / 2:,.0f}".replace(",", "{,}"))
    if rf:
        mac("RoofRatio", f"{1e6 * coef[0] / rf['updateNsPerEntry']:.0f}")
# cost model on per-iteration (time, evaluated work) pairs over a solve (costpairs.js); the first two iterations of each
# tree (compilation, first sorts) are left out; leave-one-tree-out predictions
cp = load("costpairs")
if cp:
    from scipy.optimize import nnls
    rows_ = [(t, r) for t in cp for r in t["rows"][2:]]
    X = np.array([[t["work"], r["show"]] for t, r in rows_], float)
    y = np.array([r["ms"] for t, r in rows_]); w = 1 / y
    coef = nnls(X * w[:, None], y * w)[0]
    pred = X @ coef
    rows, loos, ins, spread = [], [], [], []
    for t in cp:
        m = np.array([tt is t for tt, _ in rows_])
        cl = nnls(X[~m] * w[~m, None], y[~m] * w[~m])[0]
        e_in = np.median(np.abs(pred[m] - y[m]) / y[m]); e_lo = np.median(np.abs(X[m] @ cl - y[m]) / y[m])
        ins.append(e_in); loos.append((t["name"], e_lo))
        spread.append((np.max(y[m]) - np.min(y[m])) / np.median(y[m]))
        rows.append([t["name"], f"{t['decisions']:,}", f"{np.median(y[m]):.0f}", f"{np.median(pred[m]):.0f}", f"{100 * e_lo:.0f}\\%"])
    table("cost_table", ["tree", "decisions", "measured", "model", "held-out error"], rows, "lrrrr")
    mac("CostA", f"{1e6 * coef[0]:.0f}"); mac("CostB", f"{1e6 * coef[1]:.0f}"); mac("CostTrees", str(len(cp)))
    mac("CostPairs", str(len(rows_)))
    fl = [e for nm, e in loos if nm.startswith("flop")]
    mac("CostLooFlop", f"{100 * max(fl):.0f}\\%"); mac("CostLooAll", f"{100 * max(e for _, e in loos):.0f}\\%")
    big2 = [e for nm, e in loos if nm in ("flop, 1 size per street", "flop, standard")]
    mac("CostLoo", f"{100 * min(big2):.0f} and {100 * max(big2):.0f}\\%")
    mac("CostIterSpread", f"{100 * max(spread):.0f}\\%")
    f1 = next(t for t in cp if t["name"] == "flop, 1 size per street")
    sh = [coef[1] * r["show"] / r["ms"] for r in f1["rows"][2:]]
    mac("FlopLeafShare", f"{100 * np.median(sh):.0f}\\%")
    if rf:
        mac("RoofRatio", f"{1e6 * coef[0] / rf['updateNsPerEntry']:.0f}")

# memory estimate against actual
me = load("memest")
if me:
    act = [r for r in me if "actualMB" in r]
    table("mem_table", ["flop", "turn", "river", "MB", "built"], [[r["flop"], r["turn"], r["river"], f"{r['MB']:,.0f}", f"{r['actualMB']:,.0f}" if "actualMB" in r else "--"] for r in me], "lllrr")
    if act:
        e = 100 * max(abs(r['MB'] - r['actualMB']) / r['actualMB'] for r in act)
        mac("MemEstErr", "0.1\\%" if e < 0.1 else f"{e:.1f}\\%")
# tree sizes at a fixed flop
fz = load("convspots_flopsize")
if fz:
    names = ["later streets checked down", "river checked down", "one size per street", "standard"]
    rows = [[nm, f"{r['decisions']:,}", str(r["hit"].get("0.3", "--")), str(r["hit"].get("0.1", "--"))] for nm, r in zip(names, fz)]
    table("treesize_table", ["K72 tree", "decisions", "0.3\\%", "0.1\\%"], rows, "lrrr")
# precision baseline
pbs = load("precbase")
if pbs:
    mac("PrecBase", "$" + sci(pbs["small turn game"], 1) + "$" + (" and $" + sci(pbs["turn spot"], 1) + "$" if "turn spot" in pbs else ""))
# parallel: medians of repeated browser runs, overheads
if pb and "iqr" in pb[0]:
    rows = []
    for r in pb:
        Kc = 52 - (4 if r["spot"] == "turn" else 3); tc = 0.5; t1 = (r["P1"] - tc) / Kc
        model = lambda P: tc + math.ceil(Kc / P) * t1
        rows.append([r["spot"], f"{r['seq']:.0f}", f"{r['P1']:.0f}", f"{r['P2']:.0f}", f"{model(2):.0f}", f"{r['seq'] / r['P2']:.1f}"])
        if r["spot"] == "flop":
            mac("ParPredEight", f"{model(8):.0f}"); mac("ParEff", f"{100 * model(2) / r['P2']:.0f}\\%")
    table("parallel_table", ["spot", "seq.", "$P=1$", "$P=2$", "model", "speedup"], rows, "lrrrrr")
    mac("ParIqr", f"{100 * max((r['iqr'][k][1] - r['iqr'][k][0]) / r[k] for r in pb for k in ('seq', 'P1', 'P2')):.0f}\\%")
if pb:
    for r in pb:
        ov = 100 * (r['P1'] / r['seq'] - 1)
        mac("ParOvFlop" if r["spot"] == "flop" else "ParOvTurn", "under 1\\%" if ov < 1 else f"{ov:.0f}\\%")
# payoff sensitivity with cross-exploitability
if ps and "crossExpl" in ps["rows"][0]:
    rows = [[f"{r['stack']} bb", f"{r['valA']:.5f}", "$" + sci(abs(r['valA'] - r['valB']), 1) + "$", "$" + sci(r["crossExpl"], 1) + "$", f"{2 * r['stack'] * ps['maxTableDiff']:.2f}"] for r in ps["rows"]]
    table("sens_table", ["stack", "value", "value change", "cross-exploitability", "$\\delta$"], rows, "rrrrr")
# multiway
if mu:
    k20 = next((v for k, v in mu.items() if "20 bb" in k), None)
    if k20:
        mac("MultiTwenty", f"{k20['pts'][-1][1]:.2f}")
# report with the tight tolerance, with the solver error bound 2 expl
rt, rt95 = load("reportsub_tight"), load("reportsub_tight95")
if rt or rt95:
    rowsall = (rt["rows"] if rt else []) + (rt95["rows"] if rt95 else [])
    rows = []
    for r in sorted(rowsall, key=lambda r: r["n"]):
        fl = r["flops"]; W = sum(f["w"] for f in fl)
        def est(key):
            m = sum(f["w"] * f[key] for f in fl) / W
            var = 0.0; byg = {}
            for f in fl:
                byg.setdefault(f["group"], []).append(f)
            for g in byg.values():
                for i in range(0, len(g) - 1, 2):
                    a, b = g[i], g[i + 1]
                    var += ((a["w"] + b["w"]) / W) ** 2 * (a[key] - b[key]) ** 2 / 4
            return m, math.sqrt(var)
        v, ve = est("val0"); b_, be = est("oopBet")
        bias = 2 * sum(f["w"] * f["expl"] for f in fl) / W / 100 * 5.5
        rows.append([str(r["n"]), pm(v, ve, 3), f"{bias:.4f}", pm(100 * b_, 100 * be, 1) + "\\%"])
    table("report_table", ["flops", "big blind value", "solver bound", "big blind bets"], rows, "rrrr")
    mac("ReportTol", f"{(rt or rt95)['tol']}")

pt, fd = load("perturb"), load("flatdir")
if pt:
    mac("PertDist", "$" + sci(pt["small turn game"]["distance"], 1) + "$ and $" + sci(pt["turn spot"]["distance"], 1) + "$")
if fd:
    x = fd["small turn game"]["0.001"]
    mac("FlatClear", "$" + sci(x["clear"], 1) + "$"); mac("FlatIndiff", "$" + sci(x["indifferent"], 1) + "$")
# slopes as a small table for the notes
if slopes:
    names = {"CFR": "CFR", "CFR+": "CFR$^+$", "DCFR": "DCFR"}
    rows = []
    for nm in ("CFR", "CFR+", "DCFR"):
        row = [names[nm]]
        for st in ("river", "turn", "flop"):
            q = [sl for sl in slopes if sl[0] == st and sl[1] == nm]
            row.append(f"${q[0][2]:.1f}$ to ${q[0][3]:.1f}$" if q else "--")
        rows.append(row)
    table("slope_table", ["", "river", "turn", "flop"], rows, "lrrr")

pT = load("perturbT")
if pT:
    sm = pT["small turn game"]
    mac("CondDist", "$" + sci(np.median([r["dist"] for r in sm]), 1) + "$")
    mac("CondExplHi", "$" + sci(sm[0]["expl"], 1) + "$"); mac("CondExplLo", "$" + sci(sm[-1]["expl"], 1) + "$")

tm = load("turn_lp_mid40")
if tm:
    mac("TurnMidLP", f"{tm['lp']:.8f}"); mac("TurnMidJS", f"{tm['js'][-1]['value0']:.8f}"); mac("TurnMidHands", f"{tm['hands'][0]} and {tm['hands'][1]}")
    mac("TurnMidDiff", "$" + sci(abs(tm['lp'] - tm['js'][-1]['value0']), 0) + "$"); mac("TurnMidExpl", "$" + sci(tm['js'][-1]['expl'], 0) + "$")

# placeholders for anything still missing, so that the deck compiles
needed = ["TurnMidLP", "TurnMidJS", "TurnMidHands", "TurnMidDiff", "TurnMidExpl", "CondDist", "CondExplHi", "CondExplLo", "CostPairs", "CostLooFlop", "CostLooAll", "CostIterSpread", "ParIqr", "CostSpread", "FlopShowEval", "PertDist", "FlatClear", "FlatIndiff", "CostLoo", "MemEstErr", "PrecBase", "ParOvFlop", "ParOvTurn", "MultiTwenty", "ReportTol", "FlopLeafShare", "ParEff", "ParNodeOverhead", "FlopInfosets", "CostA", "CostB", "CostTrees", "CostResid", "FlopShowLeaves", "RoofUpdNs", "RoofCopyGBs", "RoofRatio",
          "PrecFloor", "PrecDiff", "ParCores", "ParBytes", "ParAgree", "ParPredEight", "RiverOldNew", "RiverOldOld", "TurnLP", "TurnJS", "TurnHands",
          "FlopLP", "FlopJS", "FlopHands", "LockItBefore", "LockItAfter", "LockValAfter", "LockValBefore", "LockFoldAfter", "LockFoldBefore",
          "LockBetBefore", "SensRms", "SensMax", "LowRankErr", "DDensity", "ConvSlopes", "LeafErr"]
for k in needed:
    macros.setdefault(k, "??")
for t in ("tol_table", "cost_table", "sens_table", "report_table", "treesize_table"):
    if not (data / f"{t}.tex").exists():
        (data / f"{t}.tex").write_text("\\textit{pending}\n")
(data / "numbers2.tex").write_text("".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in sorted(macros.items())))
missing = [k for k in needed if macros[k] == "??"]
print("missing:", missing)
