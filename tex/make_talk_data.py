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


def slope(pts, lo_frac=0.5):
    pts = [p for p in pts if p[1] > 0]
    k0 = int(len(pts) * lo_frac)
    x = np.log([p[0] for p in pts[k0:]])
    y = np.log([p[1] for p in pts[k0:]])
    return np.polyfit(x, y, 1)[0]


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
        slopes.append((key, name, slope(pts)))
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
for key, name, s in slopes:
    by.setdefault(name, []).append(f"{s:.2f}")
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
mem = [("--- / 33", "75 / 75", "75 / 75", 431), ("x/r 50 / 33", "75 / 75", "75 / 75", 647), ("x/r 50 / 33", "-- / 75", "75 / 75, all-in", 755),
       ("x/r 50 / 33", "66 / 66, r 50", "75 / 75, all-in", 1457), ("x/r 50 / 33, 75", "-- / 75, r 50", "75, all-in", 1681),
       ("x/r 60 / 33", "75, r 60", "75, r 60, all-in", 3614)]
table("mem_table", ["flop", "turn", "river", "MB"], [[a.replace("--", "--"), b, c, f"{m:,}"] for a, b, c, m in mem], "lllr")

# ---- precision
pr = load("precision")
if pr:
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
if lk:
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

# ---- fixed numbers
macros["TurnLP"] = "24.92419856"
macros["TurnJS"] = "24.92419863"
(data / "numbers2.tex").write_text("".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in sorted(macros.items())))
print("\n".join(f"{k} = {v}" for k, v in sorted(macros.items())))
