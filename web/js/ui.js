/* Shared interface helpers: cards, the 13 x 13 range grid, a line chart, CSV download. */
(function (root) {
  'use strict';
  const E = root.PSEngine;
  const SUIT_PATH = {
    h: '<path d="M50 90C20 64 8 47 8 31C8 17 19 8 30 8c9 0 16 5 20 12c4-7 11-12 20-12c11 0 22 9 22 23c0 16-12 33-42 59z"/>',
    d: '<path d="M50 5L87 50L50 95L13 50z"/>',
    s: '<path d="M50 5C62 26 91 42 91 63c0 12-9 20-20 20c-7 0-13-3-17-9c1 9 4 16 10 21H36c6-5 9-12 10-21c-4 6-10 9-17 9C18 83 9 75 9 63C9 42 38 26 50 5z"/>',
    c: '<circle cx="50" cy="27" r="20"/><circle cx="27" cy="58" r="20"/><circle cx="73" cy="58" r="20"/><path d="M41 40h18v28H41zM50 60c0 16-4 28-13 35h26c-9-7-13-19-13-35z"/>' };
  const SYM = {}; for (const k in SUIT_PATH) SYM[k] = `<svg class="su" viewBox="0 0 100 100" aria-hidden="true">${SUIT_PATH[k]}</svg>`;
  const SUITNAME = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);
  const fmt = x => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
  const pct = (x, d) => isFinite(x) ? (100 * x).toFixed(d == null ? 1 : d) + '%' : 'n/a';

  function cardHtml(c, tag, extra) {
    const s = E.SUITS[c & 3], r = E.RANKS[c >> 2];
    return `<${tag || 'span'} class="pcard c-${s} ${extra || ''}" ${tag === 'button' ? 'type="button"' : ''} data-c="${c}" aria-label="${r} of ${SUITNAME[s]}"><span class="r">${r}</span><span class="u">${SYM[s]}</span></${tag || 'span'}>`;
  }
  const cardText = c => `<span class="cardtag c-${E.SUITS[c & 3]}">${E.RANKS[c >> 2]}${SYM[E.SUITS[c & 3]]}</span>`;
  const comboText = k => cardText(E.COMBO_A[k]) + cardText(E.COMBO_B[k]);
  const parseBoard = s => { const t = String(s).replace(/[\s,]/g, ''); const out = []; for (let i = 0; i + 1 < t.length; i += 2) { const c = E.cardOf(t.slice(i, i + 2)); if (!(c >= 0)) throw new Error('cannot read card ' + t.slice(i, i + 2)); out.push(c); } return out; };

  /* colours of actions, as in commercial solvers: passive green, fold blue, bets from light to dark red */
  function actionColors(acts) {
    const bets = acts.map((a, i) => [a, i]).filter(([a]) => a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin');
    const ramp = ['#F2A07B', '#E5734F', '#D9573F', '#B5302C', '#8C1C24', '#5E1018'];
    const out = acts.map(a => a.kind === 'fold' ? '#4A78B5' : (a.kind === 'check' || a.kind === 'call') ? '#3A9A6B' : null);
    bets.forEach(([a, i], j) => { out[i] = a.kind === 'allin' ? '#5E1018' : ramp[Math.min(ramp.length - 2, Math.round(j * (ramp.length - 2) / Math.max(1, bets.length - 1)))]; });
    return out;
  }
  /* diverging heat colour for x in [lo, hi]: blue, light grey at the middle, red; returns css colour */
  function heat(x, lo, hi) {
    if (!isFinite(x)) return 'var(--empty)';
    const t = Math.max(0, Math.min(1, (x - lo) / ((hi - lo) || 1)));
    const A = [42, 92, 170], M = [226, 225, 221], B = [190, 40, 34];
    const m = t < 0.5 ? A.map((v, i) => v + (M[i] - v) * t * 2) : M.map((v, i) => v + (B[i] - v) * (t - 0.5) * 2);
    return `rgb(${m.map(Math.round).join(',')})`;
  }
  /* true when white text is unreadable on heat(x, lo, hi) */
  function heatLight(x, lo, hi) { const t = Math.max(0, Math.min(1, (x - lo) / ((hi - lo) || 1))); return t > 0.3 && t < 0.7; }
  /* 13 x 13 grid. opts: { onCell(k, ev), onPaint(k) } ; paint by press and drag */
  function Grid(el, opts) {
    opts = opts || {};
    let html = '';
    for (let k = 0; k < 169; k++) html += `<div class="cell" data-k="${k}"><div class="fill"></div><span class="t">${E.className(k)}</span><span class="v"></span></div>`;
    el.innerHTML = html; this.el = el; this.cells = Array.from(el.children);
    let down = false;
    const kOf = e => { const t = e.target.closest ? e.target.closest('.cell') : null; return t ? +t.dataset.k : -1; };
    el.addEventListener('pointerdown', e => { const k = kOf(e); if (k < 0) return; if (opts.onPaint && this.painting) { down = true; el.setPointerCapture && el.releasePointerCapture && 0; opts.onPaint(k); e.preventDefault(); } else if (opts.onCell) opts.onCell(k, 'click'); });
    el.addEventListener('pointermove', e => {
      let k = kOf(e);
      if (down && e.pointerType !== 'mouse') { const t = document.elementFromPoint(e.clientX, e.clientY); k = t && t.closest && t.closest('.cell') ? +t.closest('.cell').dataset.k : -1; }
      if (down && k >= 0) opts.onPaint(k); else if (opts.onCell && k >= 0) opts.onCell(k, 'hover');
    });
    window.addEventListener('pointerup', () => { if (down) { down = false; opts.onPaintEnd && opts.onPaintEnd(); } });
    el.addEventListener('pointerleave', () => opts.onCell && opts.onCell(-1, 'leave'));
    this.painting = false;
  }
  /* each cell: fraction filled (0..1) and stacked segments [{w, c}] */
  Grid.prototype.set = function (k, frac, segs, cls, label) {
    const cell = this.cells[k], fill = cell.firstChild;
    cell.className = 'cell' + (frac > 0.004 ? ' on' : '') + (cls ? ' ' + cls : '');
    fill.style.height = (frac > 0.004 ? Math.max(8, 100 * frac) : 0) + '%';
    fill.innerHTML = segs.map(s => s.w > 0.002 ? `<i style="width:${(100 * s.w).toFixed(2)}%;background:${s.c}"></i>` : '').join('');
    cell.lastChild.textContent = label || '';
  };

  /* range editor: grid + text + brush. onChange(weights169) */
  function RangeEditor(box, opts) {
    this.w = new Float64Array(169); this.opts = opts; this.brush = 1;
    box.innerHTML = `<div class="minigrid"></div>
      <div class="brushes"><span class="muted">Brush</span>${[1, 0.75, 0.5, 0.25, 0].map(b => `<button class="btn small" type="button" data-b="${b}" aria-pressed="${b === 1}">${b ? Math.round(100 * b) + '%' : 'erase'}</button>`).join('')}
      <span class="muted rcount" style="margin-left:auto"></span></div>
      <textarea spellcheck="false" aria-label="Range as text"></textarea>`;
    this.grid = new Grid(box.querySelector('.minigrid'), { onPaint: k => { this.w[k] = this.brush; this.render(); this.syncText(); }, onPaintEnd: () => opts.onChange && opts.onChange(this.w) });
    this.grid.painting = true;
    this.ta = box.querySelector('textarea'); this.count = box.querySelector('.rcount');
    box.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { this.brush = +b.dataset.b; box.querySelectorAll('[data-b]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    this.ta.onchange = () => { try { this.w = E.parseRange(this.ta.value); this.ta.classList.remove('warn'); this.render(); opts.onChange && opts.onChange(this.w); } catch (e) { this.ta.classList.add('warn'); } };
    this.color = opts.color || 'var(--p0)';
  }
  RangeEditor.prototype.setText = function (s) { this.w = E.parseRange(s); this.ta.value = E.rangeToString(this.w); this.render(); };
  RangeEditor.prototype.syncText = function () { this.ta.value = E.rangeToString(this.w); };
  RangeEditor.prototype.render = function () {
    let combos = 0;
    for (let k = 0; k < 169; k++) { const x = this.w[k]; combos += x * E.CLASS_COMBOS(k); this.grid.set(k, x, [{ w: 1, c: this.color }]); }
    this.count.textContent = `${fmt(combos)} combos, ${(100 * combos / 1326).toFixed(1)}% of hands`;
  };

  /* line chart (SVG). series: [{ name, color, pts: [[x, y]] }], log y */
  function lineChart(el, series, o) {
    o = o || {};
    const W = el.clientWidth || 420, H = o.height || 170, L = 46, R = 12, T = 10, B = 26;
    const all = series.flatMap(s => s.pts).filter(p => p[1] > 0);
    if (!all.length) { el.innerHTML = `<svg class="chart" width="${W}" height="${H}"></svg>`; return; }
    const x0 = 0, x1 = Math.max(...all.map(p => p[0]), 1);
    let y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
    if (o.target) { y0 = Math.min(y0, o.target); }
    const ly0 = Math.floor(Math.log10(y0)), ly1 = Math.ceil(Math.log10(y1)) + (Math.log10(y1) % 1 === 0 ? 0 : 0);
    const X = x => L + (W - L - R) * (x - x0) / (x1 - x0), Y = y => T + (H - T - B) * (ly1 - Math.log10(y)) / Math.max(1, ly1 - ly0);
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (let e = ly0; e <= ly1; e++) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}"/><text x="${L - 6}" y="${Y(10 ** e) + 4}" text-anchor="end">${e >= 0 ? 10 ** e : (10 ** e).toPrecision(1)}</text>`;
    s += `<line class="ax" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><text x="${W - R}" y="${H - 6}" text-anchor="end">${esc(o.xlabel || 'iterations')}: ${fmt(x1)}</text>`;
    if (o.ylabel) s += `<text x="${L}" y="${H - 6}">${esc(o.ylabel)}</text>`;
    if (o.target) s += `<line x1="${L}" x2="${W - R}" y1="${Y(o.target)}" y2="${Y(o.target)}" stroke="var(--focus)" stroke-dasharray="4 3"/>`;
    for (const se of series) { const pts = se.pts.filter(p => p[1] > 0); if (!pts.length) continue; s += `<path class="ser" stroke="${se.color}" d="${pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')}"/>`; }
    s += '</svg>'; el.innerHTML = s;
  }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const RANGES = {
    'BTN open (100bb)': '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A3o+,K9o+,Q9o+,J9o+,T9o',
    'BB call vs BTN 2.5x': '22-JJ,A2s-AJs,K2s-KJs,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o-AJo,K8o-KJo,Q9o+,J9o+,T8o+,98o,87o',
    'CO open': '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,87s,76s,65s,A8o+,KTo+,QTo+,JTo',
    'BB call vs CO': '22-TT,A2s-AJs,K5s-KJs,Q7s+,J7s+,T7s+,97s+,86s+,75s+,64s+,54s,A8o-AJo,KTo-KJo,QTo+,JTo',
    'SB 3-bet vs BTN': 'TT+,AJs+,KQs,A5s-A4s,AQo+',
    'BTN call vs SB 3-bet': '77-JJ,ATs-AQs,KTs+,QTs+,JTs,T9s,98s,87s,76s,AJo-AQo,KQo',
    'Talk example: BB': '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o,87o,-QQ+,-AKs,-AKo,-A5s',
    'Talk example: BTN': '22+,A2s+,K5s+,Q8s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,A7o+,K9o+,QTo+,JTo',
  };
  root.PSUI = { SYM, esc, $, fmt, pct, cardHtml, cardText, comboText, parseBoard, actionColors, heat, heatLight, Grid, RangeEditor, lineChart, download, RANGES };
})(typeof self !== 'undefined' ? self : this);
