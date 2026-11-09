"""Write ../tex/numbers.tex: every computed number quoted in the slides comes from ../results."""
import json, os, pickle
R = '../results/'
def e(v, d=1):
    m, x = f'{v:.{d}e}'.split('e')
    return f'{m}\\times 10^{{{int(x)}}}'
out = {}
L = json.load(open(R + 'baselines_leduc.json'))
LL = json.load(open(R + 'baselines_leduc_long.json'))
out['LeducDCFRfive'] = e(L['dcfr']['hist'][-1][1]); out['LeducDCFRfiveTime'] = f"{L['dcfr']['time']:.0f}"
out['LeducCFRplusLong'] = e(LL['cfr+']['hist'][-1][1]); out['LeducCFRplusLongTime'] = f"{LL['cfr+']['time']:.0f}"
out['LeducDCFRLong'] = e(LL['dcfr']['hist'][-1][1])
N = json.load(open(R + 'newton_leduc.json'))
best = min(N, key=lambda r: r['outer'][-1][4])
out['LeducHybWarm'] = str(best['warm']); out['LeducHybTime'] = f"{best['outer'][-1][4]:.2f}"
out['LeducHybExpl'] = e(best['outer'][-1][3]); out['LeducHybOuter'] = str(best['outer'][-1][0])
out['LeducHybNewton'] = str(best['newton_steps'])
S = json.load(open(R + 'baselines_river_small.json'))
out['SmallDCFRTime'] = f"{S['dcfr'][-1][1]:.0f}"; out['SmallDCFRIters'] = f"{S['dcfr'][-1][0]:,}".replace(',', '{,}')
out['SmallDCFRExpl'] = e(S['dcfr'][-1][2])
NS = json.load(open(R + 'newton_small.json'))
b = [r for r in NS if r['warm'] == 1000][0]
out['SmallHybTime'] = f"{b['outer'][-1][4]:.1f}"; out['SmallHybExpl'] = e(b['outer'][-1][3])
out['SmallHybNewton'] = str(b['newton_steps']); out['SmallHybOuter'] = str(b['outer'][-1][0])
M = json.load(open(R + 'baselines_river_medium.json'))
out['MedDCFRTime'] = f"{M['dcfr'][-1][1]:.0f}"; out['MedDCFRExpl'] = e(M['dcfr'][-1][2])
out['MedDCFRIters'] = f"{M['dcfr'][-1][0]:,}".replace(',', '{,}')
if os.path.exists(R + 'newton_medium.json'):
    NM = json.load(open(R + 'newton_medium.json'))[0]
    out['MedHybTime'] = f"{NM['outer'][-1][4]:.0f}"; out['MedHybExpl'] = e(NM['outer'][-1][3])
    out['MedHybOuter'] = str(NM['outer'][-1][0])
ML = json.load(open(R + 'baselines_river_medium_long.json'))
out['MedDCFRLongExpl'] = e(ML['dcfr'][-1][2]); out['MedDCFRLongTime'] = f"{ML['dcfr'][-1][1]:.0f}"
out['MedCFRpLongExpl'] = e(ML['cfr+'][-1][2])
for nm, f in (('Leduc', 'newton_leduc.json'), ('Small', 'newton_small.json')):
    for r in json.load(open(R + f)):
        if (nm == 'Leduc' and r['warm'] == 100) or (nm == 'Small' and r['warm'] == 1000):
            out[nm + 'Solves'] = str(r['newton_steps']); out[nm + 'IPM'] = str(r.get('ipm_iters', ''))
            out[nm + 'FinishTime'] = f"{r['outer'][-1][4] - r['warm_time']:.2f}"
            out[nm + 'WarmTime'] = f"{r['warm_time']:.2f}" 
P = json.load(open(R + 'purity.json'))
for k, nm in (('leduc', 'Leduc'), ('small', 'Small')):
    out[nm + 'Pure'] = f"{100 * P[k]['pure'] / P[k]['reach']:.0f}"
    out[nm + 'Support'] = f"{100 * P[k]['support'] / P[k]['nb']:.0f}"
    out[nm + 'N'] = f"{P[k]['N']:,}".replace(',', '{,}')
mdf = pickle.load(open(R + 'mdf.pkl', 'rb'))
def desc(name, p):
    c0, c1 = [float(v) for v in name[3:].split('-')]
    who = 'Button' if p == 1 else 'Big blind'
    if p == 1 and c1 == 0: line = f'BB bets {c0:.0f}'
    elif p == 1: line = f'BB checks, BTN bets {c1:.0f}, BB jams'
    elif c0 == 0: line = f'BB checks, BTN bets {c1:.0f}'
    else: line = f'BB bets {c0:.0f}, BTN jams'
    return who, line
rows = []
for name, p, s_, d, m in mdf:
    who, line = desc(name, p)
    rows.append((p, s_, f'{who} & {line} & ${s_:.2f}$ & ${100*d:.1f}\\%$ & ${100*m:.1f}\\%$ \\\\'))
rows.sort(key=lambda r: (-r[0], r[1]))
open('../tex/mdf_table.tex', 'w').write('\\begin{tabular}{@{}llccc@{}}\n\\toprule\ndefender & line & $s$ & defends & MDF \\\\ \\midrule\n'
    + '\n'.join(r[2] for r in rows) + '\n\\bottomrule\n\\end{tabular}\n')
with open('../tex/numbers.tex', 'w') as f:
    for k, v in out.items():
        f.write(f'\\newcommand{{\\{k}}}{{{v}}}\n')
print(open('../tex/numbers.tex').read())
