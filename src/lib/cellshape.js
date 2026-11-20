// Cell Shape tool core: finds cells inside a drawn region of a cell-wall image and measures their shape.
// Pure functions only (no DOM), so the browser page and the tests share exactly the same maths.
// Images are row-major arrays of width w and height h. Coordinates are pixels with y pointing down;
// reported angles follow ImageJ (counter-clockwise from the x axis, as if y pointed up).

export const VERSION = '1.0';

/* ---------- Image preparation ---------- */
// Grey values 0–1 from RGBA pixels. 'auto' takes the brightest channel, which keeps the full signal
// of single-colour fluorescence images (green, red, …) and equals the grey value of grey images.
export function toGray(rgba, w, h, channel = 'auto', invert = false){
  const n = w * h, out = new Float32Array(n);
  const c = {r: 0, g: 1, b: 2}[channel];
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    let v;
    if (c !== undefined) v = rgba[j + c];
    else if (channel === 'luma') v = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    else v = Math.max(rgba[j], rgba[j + 1], rgba[j + 2]);
    v /= 255;
    out[i] = invert ? 1 - v : v;
  }
  return out;
}

// 1 for pixels whose centres lie inside the polygon (even–odd rule). poly is [[x, y], …] in image
// coordinates; the mask covers the box x0…x0+w, y0…y0+h.
export function polygonMask(poly, x0, y0, w, h){
  const mask = new Uint8Array(w * h), xs = [];
  for (let y = 0; y < h; y++) {
    const cy = y0 + y + 0.5;
    xs.length = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i];
      if ((ay <= cy) !== (by <= cy)) xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - x0 - 0.5)), to = Math.min(w - 1, Math.floor(xs[k + 1] - x0 - 0.5));
      for (let x = from; x <= to; x++) mask[y * w + x] = 1;
    }
  }
  return mask;
}

export function polygonArea(poly){
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
}

/* ---------- Filters ---------- */
// One box-filter pass of radius r along rows or columns, treating pixels outside the image as 0.
function boxPass(src, dst, w, h, r, alongRows){
  const len = alongRows ? w : h, lines = alongRows ? h : w, step = alongRows ? 1 : w, next = alongRows ? w : 1;
  const norm = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = l * next;
    let sum = 0;
    for (let i = 0; i <= Math.min(r, len - 1); i++) sum += src[base + i * step];
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = sum * norm;
      const add = i + r + 1, sub = i - r;
      if (add < len) sum += src[base + add * step];
      if (sub >= 0) sum -= src[base + sub * step];
    }
  }
}
// Approximate Gaussian blur (three box passes in each direction).
export function blur(src, w, h, sigma){
  const r = Math.max(0, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const a = Float32Array.from(src);
  if (r < 1) return a;
  const b = new Float32Array(a.length);
  for (let k = 0; k < 3; k++) { boxPass(a, b, w, h, r, true); boxPass(b, a, w, h, r, false); }
  return a;
}
// Blur that only averages pixels inside the mask, so the region's edge does not darken the result.
export function maskedBlur(img, mask, w, h, sigma){
  const n = w * h, fm = new Float32Array(n), m = new Float32Array(n);
  for (let i = 0; i < n; i++) if (mask[i]) { fm[i] = img[i]; m[i] = 1; }
  const a = blur(fm, w, h, sigma), b = blur(m, w, h, sigma);
  for (let i = 0; i < n; i++) a[i] = mask[i] && b[i] > 1e-6 ? a[i] / b[i] : 0;
  return a;
}

// Morphological reconstruction by dilation of marker under mask (8-connected; Vincent 1993).
export function reconstruct(marker, mask, w, h){
  const r = Float32Array.from(marker);
  for (let i = 0; i < r.length; i++) if (r[i] > mask[i]) r[i] = mask[i];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let m = r[i];
    if (x > 0 && r[i - 1] > m) m = r[i - 1];
    if (y > 0) { if (r[i - w] > m) m = r[i - w]; if (x > 0 && r[i - w - 1] > m) m = r[i - w - 1]; if (x < w - 1 && r[i - w + 1] > m) m = r[i - w + 1]; }
    r[i] = Math.min(m, mask[i]);
  }
  const queue = [];
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let m = r[i];
    if (x < w - 1 && r[i + 1] > m) m = r[i + 1];
    if (y < h - 1) { if (r[i + w] > m) m = r[i + w]; if (x < w - 1 && r[i + w + 1] > m) m = r[i + w + 1]; if (x > 0 && r[i + w - 1] > m) m = r[i + w - 1]; }
    r[i] = Math.min(m, mask[i]);
    forNeighbors8(x, y, w, h, j => { if (j > i && r[j] < r[i] && r[j] < mask[j]) queue.push(i); });
  }
  while (queue.length) {
    const i = queue.pop(), x = i % w, y = (i - x) / w;
    forNeighbors8(x, y, w, h, j => {
      if (r[j] < r[i] && r[j] !== mask[j]) { r[j] = Math.min(r[i], mask[j]); queue.push(j); }
    });
  }
  return r;
}
function forNeighbors8(x, y, w, h, fn){
  const i = y * w + x;
  if (x > 0) fn(i - 1); if (x < w - 1) fn(i + 1);
  if (y > 0) { fn(i - w); if (x > 0) fn(i - w - 1); if (x < w - 1) fn(i - w + 1); }
  if (y < h - 1) { fn(i + w); if (x > 0) fn(i + w - 1); if (x < w - 1) fn(i + w + 1); }
}

// Connected components of pixels where on[i] is true. Returns {labels, n, sizes}.
export function components(on, w, h, eight = true){
  const labels = new Int32Array(w * h), sizes = [0], stack = [];
  let n = 0;
  for (let s = 0; s < labels.length; s++) {
    if (!on[s] || labels[s]) continue;
    n++; labels[s] = n; stack.push(s); let size = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w; size++;
      const visit = j => { if (on[j] && !labels[j]) { labels[j] = n; stack.push(j); } };
      if (eight) forNeighbors8(x, y, w, h, visit);
      else { if (x > 0) visit(i - 1); if (x < w - 1) visit(i + 1); if (y > 0) visit(i - w); if (y < h - 1) visit(i + w); }
    }
    sizes.push(size);
  }
  return {labels, n, sizes};
}

/* ---------- Segmentation ---------- */
// Default settings for a typical cell diameter d (pixels). split runs from 1 (fewer, larger cells)
// to 9 (more, smaller cells); 5 is the default. faces: also look for cells cut through the plane of a
// wall, which show as broad, evenly bright areas instead of a dark interior (off by default, as thick
// wall junctions in other images can be mistaken for them).
export function defaultParams(d){
  return {diameter: d, split: 5, faces: false};
}

// Finds cells inside mask, assuming bright walls around darker cell interiors (invert the image for
// dark walls). Steps:
// 1. Seeds: the image is blurred over about an eighth of a cell (sigma = 0.12 d), so each cell interior
//    becomes one dark basin. Every local minimum at least h deeper than the lowest pass to a deeper
//    minimum becomes one seed (h-minima; h = 0.12 standard deviations of the blurred image at split 5,
//    halved for every two steps up).
// 2. Cells cut through a wall face (only when p.faces is set): in an image blurred over a quarter of a cell
//    (sigma = 0.25 d), thin walls fade but broad bright faces stay. Each bright dome that rises at least
//    0.25 standard deviations above the pass to any higher one, and whose dome (the part brighter than
//    halfway between the top and the darkest pixel around it) covers at least a quarter of a typical
//    cell, gets a seed. All seeds then compete for pixels, each step costing 1 plus the difference from the
//    seed's own brightness, so dark cells spread through dark areas and face cells through bright ones;
//    the areas won by face seeds, within their bright domes, become cells if they are broad and compact (mean width at least 0.25 d,
//    solidity at least 0.7, area at least 0.35 times a typical cell); others are thick wall junctions
//    and are dropped.
// 3. Outlines: a seeded watershed on the lightly blurred image (sigma = 0.02 d, at least 1 pixel) grows
//    the dark seeds through the rest of the region until they meet, so neighbouring cells meet along the
//    brightest line of the wall between them.
// Returns {labels (0 = no cell), n, faces (number of face cells)}.
export function segment(gray, mask, w, h, p){
  const d = p.diameter, n = w * h;
  const coarse = maskedBlur(gray, mask, w, h, d * 0.12);
  let mean = 0, sq = 0, count = 0;
  for (let i = 0; i < n; i++) if (mask[i]) { mean += coarse[i]; sq += coarse[i] * coarse[i]; count++; }
  mean /= count || 1;
  const sd = Math.sqrt(Math.max(0, sq / (count || 1) - mean * mean));
  const hMin = 0.12 * sd * 2 ** ((5 - p.split) / 2);
  // h-minima of the blurred image = h-maxima of its negative
  const neg = new Float32Array(n), lowered = new Float32Array(n);
  for (let i = 0; i < n; i++) { neg[i] = mask[i] ? -coarse[i] : -1e9; lowered[i] = neg[i] - hMin; }
  const rec = reconstruct(lowered, neg, w, h);
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) dark[i] = mask[i] && neg[i] - rec[i] >= hMin * (1 - 1e-4) ? 1 : 0;
  const seeds = components(dark, w, h, true);
  const fine = maskedBlur(gray, mask, w, h, Math.max(1, d * 0.02));

  let face = null, nFaces = 0;
  const bright = !p.faces ? null : brightFaces(gray, mask, dark, w, h, d, 0.25 * sd);
  if (bright && bright.n) {
    const all = Int32Array.from(seeds.labels);
    for (let i = 0; i < n; i++) if (bright.labels[i]) all[i] = seeds.n + bright.labels[i];
    const won = competeFlood(fine, mask, all, seeds.n + bright.n, w, h);
    // a face cell is what its seed wins within its own bright dome (so it cannot creep along the
    // walls), keeping only the piece around the seed
    const raw = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (won[i] > seeds.n && bright.dome[i] === won[i] - seeds.n) raw[i] = 1;
    const pieces = components(raw, w, h, false), hasSeed = new Set();
    for (let i = 0; i < n; i++) if (pieces.labels[i] && bright.labels[i]) hasSeed.add(pieces.labels[i]);
    face = new Int32Array(n);
    for (let i = 0; i < n; i++) if (hasSeed.has(pieces.labels[i])) face[i] = won[i];
    // keep only broad, compact areas: thick wall junctions also form bright domes, but they are narrow
    // (mean width 2 × area / perimeter below 0.25 d), branched (solidity below 0.7) or small (below
    // 0.35 times the area of a typical cell)
    const keep = compactRegions(face, w, h, 0.25 * d, 0.7, 0.35 * Math.PI * (d / 2) ** 2);
    for (let i = 0; i < n; i++) if (face[i] && !keep.has(face[i])) face[i] = 0;
    nFaces = keep.size;
  }
  let rest = mask;
  if (face) { rest = new Uint8Array(n); for (let i = 0; i < n; i++) rest[i] = mask[i] && !face[i] ? 1 : 0; }
  const labels = watershed(fine, rest, seeds.labels, w, h);
  if (face) for (let i = 0; i < n; i++) if (face[i]) labels[i] = face[i];
  absorbSlivers(labels, w, h, Math.max(4, (d * 0.1) ** 2));
  return {labels, n: seeds.n + nFaces, faces: nFaces};
}

// Seeds for cells cut through a wall face: cores of broad bright domes (see segment, step 2).
export function brightFaces(gray, mask, dark, w, h, d, hB){
  const n = w * h, blurred = maskedBlur(gray, mask, w, h, d * 0.25);
  // tops: maxima rising at least hB above the lowest pass to a higher top (h-maxima)
  const pos = new Float32Array(n), lowered = new Float32Array(n), neg = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i] = mask[i] ? blurred[i] : -1e9; lowered[i] = pos[i] - hB; neg[i] = -pos[i]; }
  const rec = reconstruct(lowered, pos, w, h);
  const topOn = new Uint8Array(n);
  for (let i = 0; i < n; i++) topOn[i] = mask[i] && pos[i] - rec[i] >= hB * (1 - 1e-4) ? 1 : 0;
  const tops = components(topOn, w, h, true);
  // each top's dome: the pixels it wins (flooding downwards) that are brighter than halfway between
  // the top and the darkest pixel it wins (the half-maximum outline of the bright patch)
  const owner = watershed(neg, mask, tops.labels, w, h);
  const height = new Float32Array(tops.n + 1).fill(-Infinity), low = new Float32Array(tops.n + 1).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const L = owner[i];
    if (!L) continue;
    if (pos[i] > height[L]) height[L] = pos[i];
    if (pos[i] < low[L]) low[L] = pos[i];
  }
  const dome = new Int32Array(n), area = new Int32Array(tops.n + 1);
  for (let i = 0; i < n; i++) { const L = owner[i]; if (L && pos[i] >= low[L] + 0.65 * (height[L] - low[L])) { dome[i] = L; area[L]++; } }
  // keep domes covering a quarter of a typical cell; their seed is the part within hB / 2 of the top
  const minArea = 0.25 * Math.PI * (d / 2) ** 2, core = new Int32Array(n);
  for (let i = 0; i < n; i++) { const L = dome[i]; if (L && area[L] >= minArea && pos[i] >= height[L] - hB / 2 && !dark[i]) core[i] = L; }
  return {labels: core, n: tops.n, dome};
}

// Labels of regions of at least minArea pixels whose mean width (2 × area / perimeter, pixel edges) is at
// least minWidth and whose solidity (area / convex hull area) is at least minSolidity.
export function compactRegions(labels, w, h, minWidth, minSolidity, minArea = 0){
  const area = new Map(), edges = new Map(), first = new Map(), keep = new Set();
  for (let i = 0; i < labels.length; i++) {
    const L = labels[i];
    if (!L) continue;
    if (!first.has(L)) first.set(L, i);
    area.set(L, (area.get(L) || 0) + 1);
    const x = i % w;
    const e = (x === 0 || labels[i - 1] !== L) + (x === w - 1 || labels[i + 1] !== L) + (i < w || labels[i - w] !== L) + (i >= labels.length - w || labels[i + w] !== L);
    if (e) edges.set(L, (edges.get(L) || 0) + e);
  }
  for (const [L, A] of area) {
    if (A < minArea || 2 * A / (edges.get(L) || 1) < minWidth) continue;
    const hull = polygonArea(convexHull(traceOutline(labels, w, h, L, first.get(L))));
    if (hull > 0 && A / hull >= minSolidity) keep.add(L);
  }
  return keep;
}

// Seeded region competition: every seed grows step by step, each step into a pixel costing
// 1 + 40 × |value − the seed's mean value| / (value range); each pixel goes to the seed that reaches it
// most cheaply (Dijkstra with a bucket queue on whole-number costs).
export function competeFlood(value, mask, seeds, nSeeds, w, h, K = 40){
  const n = w * h, labels = Int32Array.from(seeds), dist = new Float64Array(n).fill(Infinity);
  const sum = new Float64Array(nSeeds + 1), cnt = new Float64Array(nSeeds + 1);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) if (mask[i]) {
    if (value[i] < lo) lo = value[i]; if (value[i] > hi) hi = value[i];
    if (seeds[i]) { sum[seeds[i]] += value[i]; cnt[seeds[i]]++; }
  }
  const ref = sum.map((v, i) => cnt[i] ? v / cnt[i] : 0), k = K / ((hi - lo) || 1);
  const B = K + 2, buckets = Array.from({length: B}, () => []);
  let pending = 0;
  for (let i = 0; i < n; i++) if (labels[i] && mask[i]) { dist[i] = 0; buckets[0].push(i); pending++; }
  for (let c = 0; pending; c++) {
    const q = buckets[c % B];
    while (q.length) {
      const i = q.pop(); pending--;
      if (dist[i] < c) continue;
      const L = labels[i], x = i % w, r = ref[L];
      const visit = j => {
        if (!mask[j]) return;
        const nd = c + 1 + Math.round(Math.abs(value[j] - r) * k);
        if (nd < dist[j]) { dist[j] = nd; labels[j] = L; buckets[nd % B].push(j); pending++; }
      };
      if (x > 0) visit(i - 1); if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w); if (i < n - w) visit(i + w);
    }
  }
  return labels;
}

// Regions smaller than minPx pixels (slivers squeezed between cells or the region's edge) join the
// neighbouring region they share the longest border with.
export function absorbSlivers(labels, w, h, minPx){
  let n = 0;
  for (const v of labels) if (v > n) n = v;
  const size = new Int32Array(n + 1);
  for (const v of labels) size[v]++;
  const small = new Set();
  for (let L = 1; L <= n; L++) if (size[L] && size[L] < minPx) small.add(L);
  if (!small.size) return;
  const border = new Map();
  for (let i = 0; i < labels.length; i++) {
    const L = labels[i];
    if (!small.has(L)) continue;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < labels.length - w ? i + w : -1]) {
      const M = j >= 0 ? labels[j] : 0;
      if (!M || M === L || small.has(M)) continue;
      const m = border.get(L) || new Map();
      m.set(M, (m.get(M) || 0) + 1);
      border.set(L, m);
    }
  }
  const to = new Map();
  for (const [L, m] of border) to.set(L, [...m].sort((a, b) => b[1] - a[1])[0][0]);
  for (let i = 0; i < labels.length; i++) { const t = to.get(labels[i]); if (t) labels[i] = t; }
}

// Seeded watershed: floods from the seeds in order of increasing value, inside the mask (4-connected).
export function watershed(value, mask, seeds, w, h){
  const n = w * h, labels = Int32Array.from(seeds);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) if (mask[i]) { if (value[i] < lo) lo = value[i]; if (value[i] > hi) hi = value[i]; }
  const L = 1024, k = hi > lo ? (L - 1) / (hi - lo) : 0;
  const level = i => Math.round((value[i] - lo) * k);
  const buckets = Array.from({length: L}, () => []);
  const queued = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (labels[i]) { queued[i] = 1; buckets[level(i)].push(i); }
  for (let b = 0; b < L; b++) {
    const q = buckets[b];
    for (let s = 0; s < q.length; s++) {
      const i = q[s], x = i % w, lab = labels[i];
      const visit = j => {
        if (queued[j] || !mask[j]) return;
        queued[j] = 1; labels[j] = lab;
        const lj = level(j);
        if (lj <= b) q.push(j); else buckets[lj].push(j);
      };
      if (x > 0) visit(i - 1); if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w); if (i < n - w) visit(i + w);
    }
    buckets[b] = null;
  }
  return labels;
}

/* ---------- Editing ---------- */
export function areAdjacent(labels, w, h, a, b){
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== a) continue;
    const x = i % w;
    if ((x > 0 && labels[i - 1] === b) || (x < w - 1 && labels[i + 1] === b) || (i >= w && labels[i - w] === b) || (i < labels.length - w && labels[i + w] === b)) return true;
  }
  return false;
}
export function mergeCells(labels, a, b){
  for (let i = 0; i < labels.length; i++) if (labels[i] === b) labels[i] = a;
}

// Pixels on the 8-connected line from (x1, y1) to (x2, y2); such a line separates 4-connected regions.
export function linePixels(x1, y1, x2, y2){
  x1 = Math.floor(x1); y1 = Math.floor(y1); x2 = Math.floor(x2); y2 = Math.floor(y2);
  const out = [], dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1), sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x1, y1]);
    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x1 += sx; }
    if (e2 <= dx) { err += dx; y1 += sy; }
  }
  return out;
}

// Cuts the cells the line crosses into pieces (only the cell labelled only, when given). Pieces smaller
// than minPiece pixels stay with the largest piece. Line pixels join the neighbouring piece. New pieces
// get labels next, next + 1, …. Returns the new labels as [[oldLabel, newLabel], …].
export function splitCells(labels, w, h, x1, y1, x2, y2, next, minPiece = 20, only = 0){
  const cut = new Uint8Array(w * h), touched = new Set();
  for (const [x, y] of linePixels(x1, y1, x2, y2)) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (labels[i] && (!only || labels[i] === only)) { cut[i] = 1; touched.add(labels[i]); }
  }
  const created = [];
  for (const L of touched) {
    let x0 = w, y0 = h, xe = -1, ye = -1;
    for (let i = 0; i < labels.length; i++) if (labels[i] === L) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > xe) xe = x; if (y < y0) y0 = y; if (y > ye) ye = y; }
    const bw = xe - x0 + 1, bh = ye - y0 + 1, on = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = (y + y0) * w + x + x0; on[y * bw + x] = labels[i] === L && !cut[i] ? 1 : 0; }
    const comp = components(on, bw, bh, false);
    const big = []; for (let k = 1; k <= comp.n; k++) if (comp.sizes[k] >= minPiece) big.push(k);
    if (big.length < 2) continue;
    big.sort((a, b) => comp.sizes[b] - comp.sizes[a]);
    const target = new Int32Array(comp.n + 1).fill(L);
    for (let k = 1; k < big.length; k++) { target[big[k]] = next; created.push([L, next]); next++; }
    // assign the pieces, then grow them into the line pixels and the small pieces
    const own = new Int32Array(bw * bh);
    for (let j = 0; j < own.length; j++) if (comp.labels[j] && comp.sizes[comp.labels[j]] >= minPiece) own[j] = target[comp.labels[j]];
    let left = true;
    while (left) {
      left = false;
      const add = [];
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const j = y * bw + x;
        if (own[j] || labels[(y + y0) * w + x + x0] !== L) continue;
        const nb = (x > 0 && own[j - 1]) || (x < bw - 1 && own[j + 1]) || (y > 0 && own[j - bw]) || (y < bh - 1 && own[j + bw]);
        if (nb) add.push(j, nb); else left = true;
      }
      if (!add.length) break;
      for (let k = 0; k < add.length; k += 2) own[add[k]] = add[k + 1];
    }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const j = y * bw + x; if (own[j]) labels[(y + y0) * w + x + x0] = own[j]; }
  }
  return created;
}

// Makes the pixels where inside is 1 (within the region mask) a new cell with label L. Cells that lose
// pixels and fall apart keep their largest piece; pieces smaller than minPiece join the new cell, larger
// ones become cells of their own (labels L + 1, …). Returns the next free label.
export function drawCell(labels, mask, w, h, inside, L, minPiece = 20){
  const affected = new Set();
  for (let i = 0; i < labels.length; i++) if (inside[i] && mask[i]) { if (labels[i]) affected.add(labels[i]); labels[i] = L; }
  let next = L + 1;
  for (const A of affected) {
    const on = new Uint8Array(labels.length);
    let any = false;
    for (let i = 0; i < labels.length; i++) if (labels[i] === A) { on[i] = 1; any = true; }
    if (!any) continue;
    const comp = components(on, w, h, false);
    if (comp.n < 2) continue;
    let big = 1;
    for (let k = 2; k <= comp.n; k++) if (comp.sizes[k] > comp.sizes[big]) big = k;
    const to = new Int32Array(comp.n + 1);
    for (let k = 1; k <= comp.n; k++) to[k] = k === big ? A : comp.sizes[k] < minPiece ? L : next++;
    for (let i = 0; i < labels.length; i++) if (comp.labels[i]) labels[i] = to[comp.labels[i]];
  }
  return next;
}

/* ---------- Shape measurement ---------- */
// Outline of the 4-connected region with label L, traced along pixel edges clockwise from the top-left
// corner of its first pixel in raster order. Only corner points are returned, as ImageJ's Wand does.
export function traceOutline(labels, w, h, L, start){
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === L;
  const sx = start % w, sy = (start - sx) / w;
  // directions E, S, W, N (y down); the region is always on the right-hand side
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  // pixels ahead-right and ahead-left of a vertex for each direction
  const AR = [[0, 0], [-1, 0], [-1, -1], [0, -1]], AL = [[0, -1], [0, 0], [-1, 0], [-1, -1]];
  let x = sx, y = sy, d = 0;
  const pts = [];
  const limit = 4 * (w + 1) * (h + 1);
  for (let guard = 0; guard < limit; guard++) {
    x += DX[d]; y += DY[d];
    const r = inside(x + AR[d][0], y + AR[d][1]), l = inside(x + AL[d][0], y + AL[d][1]);
    const nd = !r ? (d + 1) % 4 : l ? (d + 3) % 4 : d;
    if (nd !== d) pts.push([x, y]);
    d = nd;
    if (x === sx && y === sy && d === 0) break;
  }
  return pts;
}

// ImageJ's perimeter of a traced outline (PolygonRoi.getTracedPerimeter): the length along pixel
// edges minus (2 − √2) for each corner that can be cut diagonally.
export function tracedPerimeter(pts){
  const n = pts.length;
  if (n < 3) return 0;
  let sumdx = 0, sumdy = 0, corners = 0;
  let dx1 = pts[0][0] - pts[n - 1][0], dy1 = pts[0][1] - pts[n - 1][1];
  let side1 = Math.abs(dx1) + Math.abs(dy1), corner = false;
  for (let i = 0; i < n; i++) {
    const nx = (i + 1) % n, dx2 = pts[nx][0] - pts[i][0], dy2 = pts[nx][1] - pts[i][1];
    sumdx += Math.abs(dx1); sumdy += Math.abs(dy1);
    const side2 = Math.abs(dx2) + Math.abs(dy2);
    if (side1 > 1 || !corner) { corner = true; corners++; } else corner = false;
    dx1 = dx2; dy1 = dy2; side1 = side2;
  }
  return sumdx + sumdy - corners * (2 - Math.SQRT2);
}

export function convexHull(pts){
  const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Maximum caliper (Feret) diameter and its angle, and the minimum caliper width, of a convex polygon.
export function feret(hull){
  let max = 0, angle = 0;
  for (let i = 0; i < hull.length; i++) for (let j = i + 1; j < hull.length; j++) {
    const dx = hull[j][0] - hull[i][0], dy = hull[j][1] - hull[i][1], dd = Math.hypot(dx, dy);
    if (dd > max) { max = dd; angle = Math.atan2(-dy, dx) * 180 / Math.PI; }
  }
  if (angle < 0) angle += 180;
  if (angle >= 180) angle -= 180;
  let min = hull.length < 3 ? 0 : Infinity;
  for (let i = 0; i < hull.length && hull.length >= 3; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    let far = 0;
    for (const q of hull) far = Math.max(far, Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / len);
    min = Math.min(min, far);
  }
  return {max, min, angle};
}

// Box-counting fractal dimension of a cell's outline, following ImageJ's Analyze ▸ Tools ▸ Fractal Box
// Count: the outline is the cell's pixels that touch a non-cell pixel on one of their four sides
// (Process ▸ Binary ▸ Outline); square boxes of each size are laid from the top-left corner of the cell's
// bounding box, boxes containing any outline pixel are counted, and the dimension is minus the slope of
// log(count) against log(box size). Box sizes are in pixels, so the value depends on the magnification.
export const BOX_SIZES = [2, 3, 4, 6, 8, 12, 16, 32, 64];
export function boxCountDimension(labels, w, h, L, bx0, by0, bx1, by1, sizes = BOX_SIZES){
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, edge = new Uint8Array(bw * bh);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === L;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    if (labels[y * w + x] === L && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) edge[(y - by0) * bw + x - bx0] = 1;
  }
  const xs = [], ys = [];
  for (const size of sizes) {
    let count = 0;
    for (let y = 0; y < bh; y += size) for (let x = 0; x < bw; x += size) {
      let hit = false;
      for (let yy = y; yy < Math.min(bh, y + size) && !hit; yy++) for (let xx = x; xx < Math.min(bw, x + size); xx++) if (edge[yy * bw + xx]) { hit = true; break; }
      if (hit) count++;
    }
    xs.push(Math.log(size)); ys.push(Math.log(count));
  }
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  return -sxy / sxx;
}

// Folds the difference between two axis directions (degrees) into 0–90.
export function axisDifference(a, b){
  let d = ((a - b) % 180 + 180) % 180;
  return d > 90 ? 180 - d : d;
}

// Measures every labelled region. mask marks the drawn region: cells touching its edge are flagged.
// scale is µm per pixel, x0/y0 the offset of the arrays in the image, refAngle the reference direction
// (degrees, ImageJ convention) used for the angle to the surface.
export function measure(labels, mask, w, h, {scale = 1, x0 = 0, y0 = 0, refAngle = 0} = {}){
  let n = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i] > n) n = labels[i];
  const cnt = new Float64Array(n + 1), sx = new Float64Array(n + 1), sy = new Float64Array(n + 1);
  const sxx = new Float64Array(n + 1), syy = new Float64Array(n + 1), sxy = new Float64Array(n + 1);
  const first = new Int32Array(n + 1).fill(-1), edge = new Uint8Array(n + 1);
  const bx0 = new Int32Array(n + 1).fill(w), by0 = new Int32Array(n + 1).fill(h), bx1 = new Int32Array(n + 1).fill(-1), by1 = new Int32Array(n + 1).fill(-1);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const L = labels[i];
    if (!L) continue;
    if (first[L] < 0) first[L] = i;
    if (x < bx0[L]) bx0[L] = x; if (x > bx1[L]) bx1[L] = x; if (y < by0[L]) by0[L] = y; if (y > by1[L]) by1[L] = y;
    const cx = x + 0.5, cy = y + 0.5;
    cnt[L]++; sx[L] += cx; sy[L] += cy; sxx[L] += cx * cx; syy[L] += cy * cy; sxy[L] += cx * cy;
    if (!edge[L] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w])) edge[L] = 1;
  }
  const s = scale, s2 = scale * scale, cells = [];
  for (let L = 1; L <= n; L++) {
    const A = cnt[L];
    if (!A) continue;
    const mx = sx[L] / A, my = sy[L] / A;
    // central second moments of the pixel squares (the 1/12 is each square's own spread)
    const u20 = sxx[L] / A - mx * mx + 1 / 12, u02 = syy[L] / A - my * my + 1 / 12, u11 = sxy[L] / A - mx * my;
    const common = Math.sqrt(((u20 - u02) / 2) ** 2 + u11 * u11);
    const l1 = (u20 + u02) / 2 + common, l2 = Math.max(1e-12, (u20 + u02) / 2 - common);
    // ellipse with the same moments, scaled to the same area (as ImageJ's Fit Ellipse)
    const ratio = Math.sqrt(l1 / l2);
    const major = Math.sqrt(4 * A / Math.PI * ratio), minor = Math.sqrt(4 * A / Math.PI / ratio);
    let angle = -0.5 * Math.atan2(2 * u11, u20 - u02) * 180 / Math.PI;
    if (angle < 0) angle += 180;
    if (angle >= 180) angle -= 180;
    const outline = traceOutline(labels, w, h, L, first[L]);
    const perim = tracedPerimeter(outline);
    const hull = convexHull(outline);
    const hullArea = polygonArea(hull);
    const f = feret(hull);
    cells.push({
      label: L, edge: !!edge[L], px: A,
      x: (mx + x0) * s, y: (my + y0) * s,
      area: A * s2, perimeter: perim * s, pa: perim / (A * s),
      fractal: boxCountDimension(labels, w, h, L, bx0[L], by0[L], bx1[L], by1[L]),
      major: major * s, minor: minor * s, angle,
      surfaceAngle: axisDifference(angle, refAngle),
      aspect: major / minor,
      circularity: perim > 0 ? Math.min(1, 4 * Math.PI * A / (perim * perim)) : 0,
      roundness: 4 * A / (Math.PI * major * major),
      solidity: hullArea > 0 ? Math.min(1, A / hullArea) : 1,
      feret: f.max * s, minFeret: f.min * s, feretAngle: f.angle,
      outline: outline.map(([x, y]) => [x + x0, y + y0]),
    });
  }
  return cells;
}

/* ---------- Classification and summary ---------- */
// Status of each cell: 'ok', or why it is left out of the shape statistics:
// 'edge' (touches the drawn region's edge), 'small' / 'large' (outside the area limits, µm²),
// and the manual choices 'excluded' and 'space' (intercellular space). manual maps label → status.
export function classify(cells, {minArea = 0, maxArea = Infinity, excludeEdge = true} = {}, manual = {}){
  for (const c of cells) {
    c.status = manual[c.label] || (c.area < minArea ? 'small' : c.area > maxArea ? 'large' : excludeEdge && c.edge ? 'edge' : 'ok');
  }
  return cells;
}

export const METRICS = ['area', 'perimeter', 'pa', 'major', 'minor', 'aspect', 'circularity', 'roundness', 'solidity', 'fractal', 'feret', 'minFeret', 'surfaceAngle'];

function stats(values){
  const n = values.length;
  if (!n) return {mean: NaN, sd: NaN, median: NaN};
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  const v = [...values].sort((a, b) => a - b);
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  return {mean, sd, median};
}

// Summary of one region. roiArea is the drawn region's area (µm²).
// Cells counted: 'ok' and 'edge' cells (every cell in the region, whole or cut by the edge).
// Shape statistics: 'ok' cells only. Space fraction: area of 'space' regions / region area.
export function summarise(cells, roiArea){
  const ok = cells.filter(c => c.status === 'ok');
  const counted = cells.filter(c => c.status === 'ok' || c.status === 'edge');
  const space = cells.filter(c => c.status === 'space').reduce((a, c) => a + c.area, 0);
  const out = {
    measured: ok.length, counted: counted.length, roiArea,
    density: roiArea > 0 ? counted.length / roiArea * 1e6 : NaN, // per mm² when roiArea is in µm²
    spaceFraction: roiArea > 0 ? space / roiArea : NaN,
  };
  for (const m of METRICS) out[m] = stats(ok.map(c => c[m]));
  return out;
}
