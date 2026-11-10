// LT50 calculator core: reads pasted spreadsheet data and fits a logistic curve per group.
// Pure functions only (no DOM), so the browser page and the tests share exactly the same maths.
// Groups without a name get '' and the page supplies a localized label.

export const VERSION = '1.1';

const T975 = [0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042];
// Two-sided 95% t quantile; tabulated to df 30, then a close approximation (error < 0.002).
export const tq = df => df <= 30 ? T975[df] : 1.96 + 2.4 / df;

/* ---------- Reading pasted data ---------- */
export function toNum(s){
  if (s == null) return NaN;
  s = String(s)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/．/g, '.')
    .replace(/[－−–—]/g, '-')
    .replace(/[%％℃°\s]/g, '');
  if (s === '') return NaN;
  return Number(s);
}
function splitLine(line){
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(',')) return line.split(',');
  return line.trim().split(/\s+/);
}
const REP_LABEL = /^(rep\.?|r|n|no\.?|反復|#)?\s*[0-9０-９]+$/i;

// Wide: first column temperature, one column per replicate, any number of header rows
// (merged cells are carried right; replicate labels such as "rep1" are ignored when naming groups).
// Long: one observation per row — temperature, value, then any group columns.
export function parse(text){
  const table = text.split(/\r?\n/)
    .map(l => l.replace(/，/g, ','))
    .filter(l => l.trim())
    .map(l => splitLine(l).map(c => c.trim()));
  const isData = r => Number.isFinite(toNum(r[0]));
  const dataRows = table.filter(isData);
  const wide = dataRows.some(r => r.slice(2).some(c => Number.isFinite(toNum(c))));
  const rows = [];

  if (!wide){
    let skipped = 0;
    table.forEach(r => {
      const x = toNum(r[0]), y = toNum(r[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)){ skipped++; return; }
      rows.push({ x, y, g: r.slice(2).filter(Boolean).join(' / ') });
    });
    return { rows, skipped, format: 'long' };
  }

  const first = table.findIndex(isData);
  const headers = table.slice(0, first);
  const ncol = Math.max(...table.map(r => r.length));
  const filled = headers.map(hr => {
    const out = []; let prev = '';
    for (let j = 1; j < ncol; j++){
      const v = hr[j] || '';
      if (v) prev = v;
      out[j] = v || prev;
    }
    return out;
  });
  const names = [];
  for (let j = 1; j < ncol; j++){
    const parts = filled.map(f => f[j]).filter(v => v && !REP_LABEL.test(v));
    names[j] = parts.join(' / ');
  }
  const body = table.slice(first);
  const skipped = body.filter(r => !isData(r)).length;
  const good = body.filter(isData);
  for (let j = 1; j < ncol; j++){
    good.forEach(r => {
      const y = toNum(r[j]);
      if (Number.isFinite(y)) rows.push({ x: toNum(r[0]), y, g: names[j] });
    });
  }
  return { rows, skipped, format: 'wide' };
}

export function groupRows(rows){
  const groups = [];
  rows.forEach(r => {
    let g = groups.find(x => x.g === r.g);
    if (!g){ g = { g: r.g, rows: [] }; groups.push(g); }
    g.rows.push(r);
  });
  return groups;
}

/* ---------- Model and fitting ---------- */
// y = L + (U − L) / (1 + exp(−k (x − m))); p = [L, U, m, k].
const clampZ = z => Math.max(-60, Math.min(60, z));
export function model(p, x){
  const [L, U, m, k] = p;
  return L + (U - L) / (1 + Math.exp(clampZ(-k * (x - m))));
}
function grads(p, x){
  const [L, U, m, k] = p;
  const s = 1 / (1 + Math.exp(clampZ(-k * (x - m))));
  const ss = s * (1 - s);
  return [1 - s, s, -(U - L) * k * ss, (U - L) * (x - m) * ss];
}
function sseOf(p, xs, ys){
  let s = 0;
  for (let i = 0; i < xs.length; i++){ const r = ys[i] - model(p, xs[i]); s += r * r; }
  return s;
}
function solve(A, b){
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++){
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++){
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function inverse(A){
  const n = A.length, cols = [];
  for (let j = 0; j < n; j++){
    const e = new Array(n).fill(0); e[j] = 1;
    const c = solve(A, e);
    if (!c) return null;
    cols.push(c);
  }
  return A.map((_, i) => cols.map(c => c[i]));
}
function normalEq(p, xs, ys, free){
  const nf = free.length;
  const A = Array.from({ length: nf }, () => new Array(nf).fill(0));
  const b = new Array(nf).fill(0);
  for (let i = 0; i < xs.length; i++){
    const g = grads(p, xs[i]);
    const r = ys[i] - model(p, xs[i]);
    for (let a = 0; a < nf; a++){
      b[a] += g[free[a]] * r;
      for (let c = 0; c < nf; c++) A[a][c] += g[free[a]] * g[free[c]];
    }
  }
  return { A, b };
}
// Levenberg–Marquardt on the free parameters only.
function lm(p0, xs, ys, free){
  let p = p0.slice(), cur = sseOf(p, xs, ys), lambda = 1e-3;
  for (let it = 0; it < 300; it++){
    const { A, b } = normalEq(p, xs, ys, free);
    let accepted = false;
    for (let t = 0; t < 25; t++){
      const M = A.map((row, a) => row.map((v, c) => a === c ? v + lambda * (v + 1e-9) : v));
      const d = solve(M, b);
      if (d && d.every(Number.isFinite)){
        const pn = p.slice();
        free.forEach((j, a) => pn[j] += d[a]);
        const s2 = sseOf(pn, xs, ys);
        if (Number.isFinite(s2) && s2 <= cur){
          const done = (cur - s2) <= 1e-12 * (cur + 1e-12);
          p = pn; cur = s2; lambda = Math.max(lambda * 0.3, 1e-12); accepted = true;
          if (done) return { p, sse: cur };
          break;
        }
      }
      lambda *= 10;
    }
    if (!accepted) break;
  }
  return { p, sse: cur };
}
function lt50abs(p){
  const [L, U, m, k] = p;
  const s = (50 - L) / (U - L);
  if (!(s > 0 && s < 1)) return NaN;
  return m - Math.log(1 / s - 1) / k;
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

// mode: 'fixed' (L = 0, U = 100) or 'free'; def: 'mid' (inflection point) or 'abs' (curve crosses 50%).
// On failure returns { error: 'too-few' | 'no-fit' | 'no-50', need? } so the page can word it per language.
export function fitGroup(rows, mode, def){
  const xs = rows.map(r => r.x), ys = rows.map(r => r.y), n = xs.length;
  const free = mode === 'fixed' ? [2, 3] : [0, 1, 2, 3];
  if (new Set(xs).size < 3 || n <= free.length){
    return { error: 'too-few', need: free.length + 1, xs, ys };
  }
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const mx = mean(xs), my = mean(ys);
  let cv = 0;
  for (let i = 0; i < n; i++) cv += (xs[i] - mx) * (ys[i] - my);
  const sign = cv >= 0 ? 1 : -1;
  const span = xmax - xmin;

  // Multi-start: the best of 20 starting points guards against local minima.
  let best = null;
  for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]){
    for (const ks of [2, 5, 12, 30]){
      const p0 = [mode === 'fixed' ? 0 : ymin, mode === 'fixed' ? 100 : ymax, xmin + f * span, sign * ks / span];
      const r = lm(p0, xs, ys, free);
      if (Number.isFinite(r.sse) && (!best || r.sse < best.sse)) best = r;
    }
  }
  if (!best) return { error: 'no-fit', xs, ys };

  const p = best.p, df = n - free.length;
  const inv = inverse(normalEq(p, xs, ys, free).A);
  const s2 = best.sse / df;
  const cov = inv ? inv.map(r => r.map(v => v * s2)) : null;

  const useMid = mode === 'fixed' || def === 'mid';
  const ltFn = q => useMid ? q[2] : lt50abs(q);
  const lt = ltFn(p);
  if (!Number.isFinite(lt)) return { error: 'no-50', xs, ys, p };
  // Delta method with a numerical gradient of LT50 with respect to the free parameters.
  let se = NaN;
  if (cov){
    const g = free.map(j => {
      const h = 1e-6 * Math.max(1, Math.abs(p[j]));
      const a = p.slice(), b = p.slice();
      a[j] += h; b[j] -= h;
      return (ltFn(a) - ltFn(b)) / (2 * h);
    });
    let v = 0;
    for (let a = 0; a < g.length; a++) for (let c = 0; c < g.length; c++) v += g[a] * cov[a][c] * g[c];
    se = Math.sqrt(Math.max(v, 0));
  }
  const t = tq(df);
  const sst = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  return {
    p, lt, se, lo: lt - t * se, hi: lt + t * se, df,
    r2: sst > 0 ? 1 - best.sse / sst : NaN, n, xs, ys,
    outside: lt < xmin || lt > xmax
  };
}

export function analyse(text, mode, def){
  const parsed = parse(text);
  const groups = groupRows(parsed.rows);
  const results = groups.map(g => Object.assign({ g: g.g }, fitGroup(g.rows, mode, def)));
  return { ...parsed, results };
}
