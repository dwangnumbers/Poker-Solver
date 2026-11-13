/* Offline tables for the preflop solver, by Monte Carlo over deals (node web/tools/equity_tables.js [S2] [S3]).
     data/c2.u16    169 x 169 exact numbers of card-compatible combo pairs of classes i and j
     data/eq2.f32   169 x 169 all-in equity of class i against class j (ties count one half)
     data/eq3.u16   for every sorted triple a <= b <= c of classes, the three-way equities of a, b and c, scaled by 65535
   S2 and S3 are the samples per class pair and per class triple. */
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path'), fs = require('fs');
const E = require('../js/engine.js');
const classCombos = Array.from({ length: 169 }, () => []);
for (let k = 0; k < 1326; k++) classCombos[E.COMBO_CLASS[k]].push(k);
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function sampleEq(cls, S, rand) {
  // equities of the classes in cls (2 or 3) over S deals with compatible hands and a random board
  const m = cls.length, acc = new Float64Array(m), used = new Uint8Array(52), c7 = new Int8Array(7), str = new Int32Array(m);
  let ok = 0, tries = 0;
  while (ok < S && tries < S * 50) {
    tries++; used.fill(0); const hands = [];
    let bad = false;
    for (const c of cls) { const L = classCombos[c], k = L[Math.floor(rand() * L.length)], a = E.COMBO_A[k], b = E.COMBO_B[k]; if (used[a] || used[b]) { bad = true; break; } used[a] = used[b] = 1; hands.push([a, b]); }
    if (bad) continue;
    let nb = 0; while (nb < 5) { const x = Math.floor(rand() * 52); if (!used[x]) { used[x] = 1; c7[nb++] = x; } }
    let best = -1, nbest = 0;
    for (let h = 0; h < m; h++) { c7[5] = hands[h][0]; c7[6] = hands[h][1]; str[h] = E.evalCards(c7, 7); if (str[h] > best) { best = str[h]; nbest = 1; } else if (str[h] === best) nbest++; }
    for (let h = 0; h < m; h++) if (str[h] === best) acc[h] += 1 / nbest;
    ok++;
  }
  return ok ? Array.from(acc, x => x / ok) : null;
}
if (isMainThread) {
  const S2 = +process.argv[2] || 50000, S3 = process.argv[3] === undefined ? 1000 : +process.argv[3], SEED = +process.argv[4] || 12345, SUFFIX = process.argv[5] || '', W = require('os').cpus().length;
  const out = path.join(__dirname, '..', 'data'); fs.mkdirSync(out, { recursive: true });
  // exact compatible pair counts
  const c2 = new Uint16Array(169 * 169);
  for (let a = 0; a < 1326; a++) for (let b = 0; b < 1326; b++) { const x = [E.COMBO_A[a], E.COMBO_B[a]], y = [E.COMBO_A[b], E.COMBO_B[b]]; if (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) c2[E.COMBO_CLASS[a] * 169 + E.COMBO_CLASS[b]]++; }
  if (!SUFFIX) fs.writeFileSync(path.join(out, 'c2.u16'), Buffer.from(c2.buffer));
  const t0 = Date.now(); let done = 0;
  const eq2 = new Float32Array(169 * 169), eq3 = new Uint16Array(818805 * 3);
  const jobs = Array.from({ length: W }, (_, w) => new Promise(res => {
    const wk = new Worker(__filename, { workerData: { w, W, S2, S3, SEED } });
    wk.on('message', m => {
      if (m.kind === 'eq2') for (const [i, j, e] of m.rows) { eq2[i * 169 + j] = e; eq2[j * 169 + i] = 1 - e; }
      else if (m.kind === 'eq3') for (const [t, a, b, c] of m.rows) { eq3[3 * t] = a; eq3[3 * t + 1] = b; eq3[3 * t + 2] = c; }
      else if (m.kind === 'progress') { done++; if (done % 50 === 0) console.log('rows done', done, ((Date.now() - t0) / 1000).toFixed(0) + 's'); }
    });
    wk.on('exit', res);
  }));
  Promise.all(jobs).then(() => {
    fs.writeFileSync(path.join(out, 'eq2' + SUFFIX + '.f32'), Buffer.from(eq2.buffer));
    if (S3 > 0) fs.writeFileSync(path.join(out, 'eq3' + SUFFIX + '.u16'), Buffer.from(eq3.buffer));
    console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  });
} else {
  const { w, W, S2, S3, SEED } = workerData, rand = rng(SEED + w * 7919);
  // pairs: rows i assigned round-robin
  for (let i = w; i < 169; i += W) {
    const rows = [];
    for (let j = i; j < 169; j++) { const e = sampleEq([i, j], S2, rand); rows.push([i, j, e ? (i === j ? 0.5 : e[0]) : 0.5]); }
    parentPort.postMessage({ kind: 'eq2', rows });
  }
  // triples a <= b <= c in lexicographic order; t indexes them
  let t = 0;
  if (S3 === 0) return;
  for (let a = 0; a < 169; a++) {
    const rows = [];
    for (let b = a; b < 169; b++) for (let c = b; c < 169; c++, t++) {
      if (a % W !== w) continue;
      const e = sampleEq([a, b, c], S3, rand) || [1 / 3, 1 / 3, 1 / 3];
      rows.push([t, Math.round(e[0] * 65535), Math.round(e[1] * 65535), Math.round(e[2] * 65535)]);
    }
    if (rows.length) parentPort.postMessage({ kind: 'eq3', rows });
    parentPort.postMessage({ kind: 'progress' });
  }
}
