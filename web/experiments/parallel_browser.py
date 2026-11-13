# Parallel timings inside Chrome (the site's environment): sequential solver and the pool with 1 and 2 Web Workers.
# Needs the site served at localhost:8765 (python3 -m http.server 8765 in docs/). -> out/parallel_browser.json
import json
from playwright.sync_api import sync_playwright
JS = r"""
async () => {
  const E = PSEngine, P = PSPool.Pool, R = PSUI.RANGES;
  const x = (b, r, a) => ({ bet: b || [], raise: r || [], allin: !!a });
  const T = (f, t, r) => ({ streets: { flop: { oop: f[0], ip: f[1] }, turn: { oop: t[0], ip: t[1] }, river: { oop: r[0], ip: r[1] } }, maxBets: 2, allinThreshold: 0.67, mergeTolerance: 0.1 });
  const ranges = [E.parseRange(R['BB call vs BTN 2.5x']), E.parseRange(R['BTN open (100bb)'])];
  const spots = { turn: { board: 'Ks7d2c5h', pot: 12, stack: 91, tree: T([x(), x()], [x([75]), x([75], [50])], [x([75], [], 1), x([75], [], 1)]) },
                  flop: { board: 'Ks7d2c', pot: 5.5, stack: 97.5, tree: T([x(), x([33])], [x([75]), x([75])], [x([75]), x([75])]) } };
  const out = [];
  for (const [k, sp] of Object.entries(spots)) {
    const cfg = { board: sp.board.match(/../g).map(E.cardOf), pot: sp.pot, stack: sp.stack, ranges, tree: sp.tree };
    // interleaved: each round times the sequential solver, one worker and two workers in turn
    const REP = 7, reps = { seq: [], P1: [], P2: [] };
    const s = new E.Solver(E.buildGame(cfg)); s.iterate(2);
    const pools = { P1: await P.create(cfg, { workers: 1, url: 'js/worker.js' }), P2: await P.create(cfg, { workers: 2, url: 'js/worker.js' }) };
    await pools.P1.iterate(2); await pools.P2.iterate(2);
    for (let r = 0; r < REP; r++) {
      let t0 = performance.now(); s.iterate(4); reps.seq.push((performance.now() - t0) / 4);
      for (const k of ['P1', 'P2']) { t0 = performance.now(); await pools[k].iterate(4); reps[k].push((performance.now() - t0) / 4); }
    }
    pools.P1.terminate(); pools.P2.terminate();
    const q = (a, f) => { const b = a.slice().sort((x, y) => x - y); const i = f * (b.length - 1), lo = Math.floor(i); return b[lo] + (b[Math.ceil(i)] - b[lo]) * (i - lo); };
    const row = { spot: k, reps, seq: q(reps.seq, 0.5), P1: q(reps.P1, 0.5), P2: q(reps.P2, 0.5),
      iqr: { seq: [q(reps.seq, 0.25), q(reps.seq, 0.75)], P1: [q(reps.P1, 0.25), q(reps.P1, 0.75)], P2: [q(reps.P2, 0.25), q(reps.P2, 0.75)] } };
    out.push(row);
  }
  return out;
}
"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(); pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(1000)
    res = pg.evaluate(JS); print(json.dumps(res))
    open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'out', 'parallel_browser.json'), 'w').write(json.dumps(res))
    b.close()
