/* Memory bandwidth of this JavaScript runtime, for comparison with the regret update. node roofline.js -> out/roofline.json
   copy:   y[i] = x[i]                         (float32, 8 bytes per entry)
   update: R[i] = R[i]*d + a[i]; S[i] = S[i]*w + b[i]*c[i]   (the DCFR update: R, S float32 read and written,
           a, b, c float64 read; 8 + 8 + 24 = 40 bytes per entry) */
const fs = require('fs'), N = 1 << 25;
const x = new Float32Array(N), y = new Float32Array(N), R = new Float32Array(N), S = new Float32Array(N);
const M = 1 << 12, a = new Float64Array(M), b = new Float64Array(M), c = new Float64Array(M);   // small, cache resident, as in the solver
for (let i = 0; i < N; i++) { x[i] = i; R[i] = i % 7 - 3; S[i] = 1; } for (let i = 0; i < M; i++) { a[i] = 0.1; b[i] = 0.5; c[i] = 0.3; }
function time(f, reps) { f(); const t0 = process.hrtime.bigint(); for (let r = 0; r < reps; r++) f(); return Number(process.hrtime.bigint() - t0) / 1e9 / reps; }
const tc = time(() => { for (let i = 0; i < N; i++) y[i] = x[i]; }, 5);
const tu = time(() => { for (let o = 0; o < N; o += M) for (let i = 0; i < M; i++) { const k = o + i, r = R[k]; R[k] = (r > 0 ? r * 0.99 : r * 0.5) + a[i]; S[k] = S[k] * 0.98 + b[i] * c[i]; } }, 5);
const res = { entries: N, copyGBs: 8 * N / tc / 1e9, copyNsPerEntry: 1e9 * tc / N, updateGBs: 16 * N / tu / 1e9, updateNsPerEntry: 1e9 * tu / N };
console.log(JSON.stringify(res));
fs.writeFileSync(__dirname + '/out/roofline.json', JSON.stringify(res));
