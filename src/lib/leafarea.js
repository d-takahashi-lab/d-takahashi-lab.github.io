// Leaf Area tool core: finds plants (green pixels) inside a drawn region of a photograph and measures them.
// Pure functions only (no DOM), so the browser page and the tests share exactly the same maths.
// Images are row-major arrays of width w and height h. Coordinates are pixels with y pointing down.
// Outline, hull and Feret helpers are shared with the Cell Shape tool.

import {components, traceOutline, tracedPerimeter, convexHull, polygonArea, feret} from './cellshape.js';

export const VERSION = '1.2';

/* ---------- Colour ---------- */
// White reference: the median of each channel over the image (every step-th pixel). The background
// usually covers most of a photograph, so this is its colour; dividing by it removes the colour cast of
// the lighting (for example the pink of red and blue LEDs).
export function whiteReference(rgba, w, h, step = 7){
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (let i = 0; i < w * h; i += step) { hist[0][rgba[i * 4]]++; hist[1][rgba[i * 4 + 1]]++; hist[2][rgba[i * 4 + 2]]++; n++; }
  return hist.map(hg => { let s = 0; for (let v = 0; v < 256; v++) { s += hg[v]; if (s * 2 >= n) return Math.max(1, v); } return 255; });
}

// Greenness of each pixel: the excess green index of the white-balanced colour, divided by its brightness,
// (2G − R − B) / (R + G + B) with R, G, B each divided by the white reference. 0 for grey or white, up to 2
// for pure green; negative for red, purple and blue. Dividing by brightness keeps dark green (shaded leaf
// margins, petioles) as green as bright green. Pixels darker than 2% of the reference count as 0.
export function greenIndex(rgba, w, h, ref){
  const n = w * h, out = new Float32Array(n), [kr, kg, kb] = ref.map(v => 1 / v);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = rgba[j] * kr, g = rgba[j + 1] * kg, b = rgba[j + 2] * kb, s = r + g + b;
    out[i] = s > 0.06 ? (2 * g - r - b) / s : 0;
  }
  return out;
}

// Brightness relative to the white reference (background ≈ 1): the mean of the three balanced channels.
// Petioles and leaf margins that are hardly green are still clearly darker than the background.
export function brightness(rgba, w, h, ref){
  const n = w * h, out = new Float32Array(n), [kr, kg, kb] = ref.map(v => 1 / (3 * v));
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = rgba[j] * kr + rgba[j + 1] * kg + rgba[j + 2] * kb;
  return out;
}

// Otsu's threshold of the values inside the mask (histogram of 512 bins between −1 and 2).
export function otsu(values, mask){
  const B = 512, lo = -1, hi = 2, hist = new Float64Array(B);
  let n = 0;
  for (let i = 0; i < values.length; i++) if (mask[i]) { hist[Math.max(0, Math.min(B - 1, Math.floor((values[i] - lo) / (hi - lo) * B)))]++; n++; }
  let sum = 0; for (let k = 0; k < B; k++) sum += k * hist[k];
  let wB = 0, sB = 0, best = -1, at = 0;
  for (let k = 0; k < B; k++) {
    wB += hist[k]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sB += k * hist[k];
    const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (v > best) { best = v; at = k; }
  }
  return lo + (at + 1) / B * (hi - lo);
}

// Automatic threshold of a region: Otsu's threshold of its greenness, but at least MIN_THRESHOLD, so that a
// region without plants (where Otsu's method splits the background noise) finds nothing.
export const MIN_THRESHOLD = 0.15;
export function autoThreshold(index, mask){
  return Math.max(MIN_THRESHOLD, otsu(index, mask));
}

/* ---------- Detection ---------- */
// Finds plants inside mask from the greenness index. Steps:
// 1. Plant pixels: greenness at least t, plus pixels connected to them with greenness at least t / 2
//    (hysteresis), which picks up thin petioles and shaded leaf margins without picking up isolated noise.
//    With bright (brightness) and darkLevel, connected pixels darker than darkLevel times the median
//    brightness of the region's background are taken too: petioles and leaf margins that are dark but
//    hardly green.
// 2. Holes inside plant pixels smaller than minPx (glare on a leaf) are filled.
// 3. Pieces closer than gapPx to each other belong to the same plant (a rosette whose petioles are too
//    thin to see stays one plant); gapPx = 0 keeps every piece separate.
// 4. Plants smaller than minPx in total are dropped.
// Returns {labels (0 = not a plant; 1…n numbered in raster order of their first pixel), n}.
export function detectPlants(index, mask, w, h, {threshold, minPx = 0, gapPx = 0, bright = null, darkLevel = 0}){
  const n = w * h, strong = new Uint8Array(n), weak = new Uint8Array(n);
  // the background brightness of this region: the median over its pixels that are not green
  // (so a region with a darker background than the rest of the photograph, such as soil, is judged by its own)
  const dark = bright && darkLevel > 0 ? darkLevel * regionMedian(bright, mask, index, threshold / 2) : -Infinity;
  for (let i = 0; i < n; i++) if (mask[i]) {
    if (index[i] >= threshold) strong[i] = 1;
    // pale green, or darker than darkLevel times the background brightness
    if (index[i] >= threshold / 2 || bright?.[i] <= dark) weak[i] = 1;
  }
  const wc = components(weak, w, h, true), keepC = new Uint8Array(wc.n + 1);
  for (let i = 0; i < n; i++) if (strong[i]) keepC[wc.labels[i]] = 1;
  const plant = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (keepC[wc.labels[i]]) plant[i] = 1;
  fillHoles(plant, mask, w, h, minPx);
  const groups = groupPieces(plant, w, h, gapPx);
  // drop small plants and renumber the rest in raster order
  const size = new Int32Array(groups.n + 1);
  for (let i = 0; i < n; i++) if (plant[i]) size[groups.labels[i]]++;
  const to = new Int32Array(groups.n + 1);
  let next = 0;
  const labels = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (!plant[i]) continue;
    const g = groups.labels[i];
    if (size[g] < minPx) continue;
    if (!to[g]) to[g] = ++next;
    labels[i] = to[g];
  }
  return {labels, n: next};
}

// Median of values over the mask where index is below below (histogram of 1024 bins between 0 and 2).
function regionMedian(values, mask, index, below){
  const B = 1024, hist = new Float64Array(B);
  let n = 0;
  for (let i = 0; i < values.length; i++) if (mask[i] && index[i] < below) { hist[Math.max(0, Math.min(B - 1, Math.floor(values[i] / 2 * B)))]++; n++; }
  if (!n) return 1;
  for (let k = 0, c = 0; k < B; k++) { c += hist[k]; if (c >= n / 2) return (k + 0.5) * 2 / B; }
  return 1;
}

// Fills holes of fewer than maxPx pixels: background pieces (4-connected) inside the mask that do not
// reach the mask's edge or the array's border.
export function fillHoles(on, mask, w, h, maxPx){
  if (!(maxPx > 0)) return on;
  const off = new Uint8Array(w * h);
  for (let i = 0; i < off.length; i++) off[i] = on[i] ? 0 : 1;
  const c = components(off, w, h, false), open = new Uint8Array(c.n + 1);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const L = c.labels[i];
    if (L && (!mask[i] || x === 0 || y === 0 || x === w - 1 || y === h - 1)) open[L] = 1;
  }
  for (let i = 0; i < off.length; i++) { const L = c.labels[i]; if (L && !open[L] && c.sizes[L] < maxPx) on[i] = 1; }
  return on;
}

// Groups the pieces of on that are at most gapPx apart (that many background pixels between them): every
// pixel within gapPx / 2 of a piece (chamfer distance, steps 1 and √2) is added around it, and pieces
// whose surroundings touch form one group.
// Returns {labels (group of each pixel of on, 0 elsewhere), n}.
export function groupPieces(on, w, h, gapPx){
  const n = w * h;
  if (!(gapPx > 0)) {
    const c = components(on, w, h, true);
    return {labels: c.labels, n: c.n};
  }
  const r = gapPx / 2, d = new Float32Array(n).fill(Infinity), D = Math.SQRT2;
  for (let i = 0; i < n; i++) if (on[i]) d[i] = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + D); if (x < w - 1) v = Math.min(v, d[i - w + 1] + D); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + D); if (x > 0) v = Math.min(v, d[i + w - 1] + D); }
    d[i] = v;
  }
  const near = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (d[i] <= r) near[i] = 1;
  const c = components(near, w, h, true), labels = new Int32Array(n);
  for (let i = 0; i < n; i++) if (on[i]) labels[i] = c.labels[i];
  return {labels, n: c.n};
}

/* ---------- Editing ---------- */
// Cuts plant L along the straight line through (x1, y1) and (x2, y2): its pixels on the left of the line
// (seen from the first point towards the second) get the new label next. Returns false (and changes
// nothing) unless both sides keep at least minPx pixels.
export function splitPlant(labels, w, h, L, x1, y1, x2, y2, next, minPx = 1){
  const dx = x2 - x1, dy = y2 - y1;
  let a = 0, b = 0;
  const side = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== L) continue;
    const x = i % w + 0.5, y = (i - i % w) / w + 0.5;
    if (dx * (y - y1) - dy * (x - x1) < 0) { side[i] = 1; a++; } else b++;
  }
  if (a < minPx || b < minPx) return false;
  for (let i = 0; i < labels.length; i++) if (side[i]) labels[i] = next;
  return true;
}

// The plant label the segment from (x1, y1) to (x2, y2) crosses most often, or 0.
export function plantOnLine(labels, w, h, x1, y1, x2, y2){
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) + 1, count = new Map();
  for (let s = 0; s <= steps; s++) {
    const x = Math.floor(x1 + (x2 - x1) * s / steps), y = Math.floor(y1 + (y2 - y1) * s / steps);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const L = labels[y * w + x];
    if (L) count.set(L, (count.get(L) || 0) + 1);
  }
  let best = 0, most = 0;
  for (const [L, c] of count) if (c > most) { most = c; best = L; }
  return best;
}

// Adds the pixels where inside is 1 (within the mask) to a plant: the plant that already has most pixels
// inside, or a new plant labelled next when there is none. Returns the label used.
export function addArea(labels, mask, inside, next){
  const count = new Map();
  for (let i = 0; i < labels.length; i++) if (inside[i] && mask[i] && labels[i]) count.set(labels[i], (count.get(labels[i]) || 0) + 1);
  let L = next, most = 0;
  for (const [k, c] of count) if (c > most) { most = c; L = k; }
  for (let i = 0; i < labels.length; i++) if (inside[i] && mask[i]) labels[i] = L;
  return L;
}

// Removes the pixels where inside is 1 from every plant.
export function eraseArea(labels, inside){
  for (let i = 0; i < labels.length; i++) if (inside[i]) labels[i] = 0;
}

// Pixels inside a circle (centre cx, cy and radius r in image coordinates), over the box x0…x0+w, y0…y0+h.
export function circleMask(cx, cy, r, x0, y0, w, h){
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x0 + x + 0.5 - cx) ** 2 + (y0 + y + 0.5 - cy) ** 2 <= r * r) mask[y * w + x] = 1;
  return mask;
}

/* ---------- Measurement ---------- */
// Measures every plant. A plant may be in several pieces (leaves whose petioles were not seen): its area
// is that of all pieces, its perimeter the sum of their outer outlines, and its convex hull covers them all.
// mask marks the drawn region: plants touching its edge are flagged. scale is mm per pixel and x0/y0
// the offset of the arrays in the image. index (optional) gives the mean greenness of each plant.
export function measurePlants(labels, mask, w, h, {scale = 1, x0 = 0, y0 = 0} = {}){
  let n = 0;
  for (const v of labels) if (v > n) n = v;
  const cnt = new Float64Array(n + 1), sx = new Float64Array(n + 1), sy = new Float64Array(n + 1), edge = new Uint8Array(n + 1);
  const bx0 = new Int32Array(n + 1).fill(w), by0 = new Int32Array(n + 1).fill(h), bx1 = new Int32Array(n + 1).fill(-1), by1 = new Int32Array(n + 1).fill(-1);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const L = labels[i];
    if (!L) continue;
    cnt[L]++; sx[L] += x + 0.5; sy[L] += y + 0.5;
    if (x < bx0[L]) bx0[L] = x; if (x > bx1[L]) bx1[L] = x; if (y < by0[L]) by0[L] = y; if (y > by1[L]) by1[L] = y;
    if (!edge[L] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w])) edge[L] = 1;
  }
  const s = scale, plants = [];
  for (let L = 1; L <= n; L++) {
    const A = cnt[L];
    if (!A) continue;
    // pieces of the plant (4-connected) inside its bounding box
    const bw = bx1[L] - bx0[L] + 1, bh = by1[L] - by0[L] + 1, on = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) on[y * bw + x] = labels[(y + by0[L]) * w + x + bx0[L]] === L ? 1 : 0;
    const pieces = components(on, bw, bh, false), first = new Int32Array(pieces.n + 1).fill(-1);
    for (let i = 0; i < on.length; i++) { const p = pieces.labels[i]; if (p && first[p] < 0) first[p] = i; }
    let perim = 0;
    const points = [], outlines = [];
    for (let p = 1; p <= pieces.n; p++) {
      const o = traceOutline(pieces.labels, bw, bh, p, first[p]);
      perim += tracedPerimeter(o);
      for (const q of o) points.push(q);
      outlines.push(o.map(([x, y]) => [x + bx0[L] + x0, y + by0[L] + y0]));
    }
    const hull = convexHull(points), hullArea = polygonArea(hull), f = feret(hull);
    plants.push({
      label: L, edge: !!edge[L], px: A, pieces: pieces.n,
      x: (sx[L] / A + x0) * s, y: (sy[L] / A + y0) * s,
      area: A * s * s, perimeter: perim * s,
      hullArea: hullArea * s * s, compactness: hullArea > 0 ? Math.min(1, A / hullArea) : 1,
      diameter: f.max * s, width: f.min * s,
      hull: hull.map(([x, y]) => [x + bx0[L] + x0, y + by0[L] + y0]), outlines,
    });
  }
  return plants;
}

/* ---------- Classification and summary ---------- */
// Status of each plant: 'ok', 'edge' (touches the drawn region's edge, so part of it may be outside;
// only when excludeEdge is set) or the manual choice 'excluded'. manual maps label → status.
export function classify(plants, {excludeEdge = true} = {}, manual = {}){
  for (const p of plants) p.status = manual[p.label] || (excludeEdge && p.edge ? 'edge' : 'ok');
  return plants;
}

export const METRICS = ['area', 'perimeter', 'hullArea', 'compactness', 'diameter', 'width'];

function stats(values){
  const n = values.length;
  if (!n) return {mean: NaN, sd: NaN, median: NaN, sum: 0};
  const sum = values.reduce((a, b) => a + b, 0), mean = sum / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  const v = [...values].sort((a, b) => a - b);
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  return {mean, sd, median, sum};
}

// Summary of one region over its 'ok' plants: their number, total area and the statistics of each measure.
export function summarise(plants){
  const ok = plants.filter(p => p.status === 'ok');
  const out = {count: ok.length, total: ok.reduce((a, p) => a + p.area, 0), left: plants.length - ok.length};
  for (const m of METRICS) out[m] = stats(ok.map(p => p[m]));
  return out;
}

// Numbers for the plants of a new detection that follow the old ones: each new plant takes the number of
// the nearest old plant (centroids within maxDist, closest pairs first); the rest get the next free numbers.
// Used when the same regions are analysed in the next photograph of a time series. Returns a Map new → old.
export function matchPlants(oldPlants, newPlants, maxDist){
  const pairs = [];
  for (const a of newPlants) for (const b of oldPlants) {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d <= maxDist) pairs.push([d, a.label, b.label]);
  }
  pairs.sort((p, q) => p[0] - q[0]);
  const map = new Map(), used = new Set();
  for (const [, a, b] of pairs) if (!map.has(a) && !used.has(b)) { map.set(a, b); used.add(b); }
  let next = Math.max(0, ...oldPlants.map(p => p.label)) + 1;
  for (const a of [...newPlants].sort((p, q) => p.label - q.label)) if (!map.has(a.label)) map.set(a.label, next++);
  return map;
}
