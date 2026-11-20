import test from 'node:test';
import assert from 'node:assert/strict';
import {whiteReference, greenIndex, otsu, autoThreshold, MIN_THRESHOLD, detectPlants, fillHoles, groupPieces, measurePlants, classify, summarise, splitPlant, plantOnLine, addArea, eraseArea, circleMask, matchPlants} from '../src/lib/leafarea.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const all = n => new Uint8Array(n).fill(1);

// A photograph-like RGBA image: a pinkish background (as under red and blue LEDs) with dark green shapes.
const BG = [190, 158, 152], LEAF = [40, 36, 4];
function photo(w, h, inside){
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = inside(x + 0.5, y + 0.5) || BG, i = (y * w + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  }
  return rgba;
}

test('greenness: the white reference removes the colour cast; background is 0, leaves are green', () => {
  const w = 40, h = 40, rgba = photo(w, h, (x, y) => x < 10 && y < 10 ? LEAF : null);
  const ref = whiteReference(rgba, w, h, 1);
  assert.deepEqual(ref, BG);
  const g = greenIndex(rgba, w, h, ref);
  close(g[39 * w + 39], 0, 1e-6, 'background');
  assert.ok(g[0] > 0.4, `leaf ${g[0]}`);
  // a darker shade of the same green is just as green (the index is divided by brightness)
  const dark = greenIndex(new Uint8ClampedArray([20, 18, 2, 255]), 1, 1, ref)[0];
  close(dark, g[0], 0.03, 'dark green');
  // grey, red and blue are not green
  const others = greenIndex(new Uint8ClampedArray([95, 79, 76, 255, 200, 60, 60, 255, 60, 60, 200, 255]), 3, 1, ref);
  close(others[0], 0, 0.01, 'grey'); assert.ok(others[1] < 0 && others[2] < 0, 'red and blue');
});

test('Otsu’s threshold separates two groups; the automatic threshold has a floor', () => {
  const v = new Float32Array(1000);
  for (let i = 0; i < 1000; i++) v[i] = i < 800 ? 0.02 * (i % 5) / 4 : 0.5 + 0.1 * (i % 5) / 4;
  const t = otsu(v, all(1000));
  assert.ok(t > 0.02 && t <= 0.5, `threshold ${t}`);
  // background noise only: the automatic threshold stays at the floor
  const noise = Float32Array.from({length: 1000}, (_, i) => 0.04 * ((i * 37) % 11) / 10 - 0.02);
  assert.equal(autoThreshold(noise, all(1000)), MIN_THRESHOLD);
});

test('detection: hysteresis, holes, specks and joining pieces into plants', () => {
  const w = 120, h = 60, n = w * h, idx = new Float32Array(n);
  const set = (x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) idx[y * w + x] = v; };
  set(10, 10, 30, 30, 0.6);    // plant A: a leaf …
  set(14, 30, 26, 32, 0.2);    // … with a pale margin connected to it (between t/2 and t)
  set(18, 18, 21, 21, 0);      // … and a small hole (glare)
  set(34, 10, 44, 20, 0.6);    // a second leaf of A, 4 px away (petiole not seen)
  set(70, 10, 100, 40, 0.6);   // plant B, far away
  set(60, 50, 64, 54, 0.2);    // a pale patch not connected to any plant: not a plant
  set(110, 50, 112, 52, 0.6);  // a speck of 4 px: dropped
  const {labels, n: count} = detectPlants(idx, all(n), w, h, {threshold: 0.3, minPx: 10, gapPx: 6});
  assert.equal(count, 2);
  const A = labels[10 * w + 10], B = labels[10 * w + 70];
  assert.ok(A && B && A !== B);
  assert.equal(labels[31 * w + 20], A, 'pale margin connected to the leaf');
  assert.equal(labels[19 * w + 19], A, 'hole filled');
  assert.equal(labels[15 * w + 40], A, 'second leaf joined to the plant');
  assert.equal(labels[52 * w + 62], 0, 'unconnected pale patch');
  assert.equal(labels[50 * w + 110], 0, 'speck');
  // without joining, the second leaf is a plant of its own
  assert.equal(detectPlants(idx, all(n), w, h, {threshold: 0.3, minPx: 10, gapPx: 0}).n, 3);
});

test('holes touching the region edge or the border are not filled; groups need the gap', () => {
  const w = 10, h = 10, on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 2 || x === 6 || y === 2 || y === 6) on[y * w + x] = 1;
  fillHoles(on, all(w * h), w, h, 100);
  assert.equal(on[4 * w + 4], 1, 'enclosed hole filled');
  assert.equal(on[0], 0, 'corner (open to the border) not filled');
  const two = new Uint8Array(20); two[0] = 1; two[5] = 1;
  // 4 empty pixels between the two pieces
  assert.equal(groupPieces(two, 20, 1, 3).n, 2, 'gap 3');
  const g = groupPieces(two, 20, 1, 4);
  assert.equal(g.labels[0], g.labels[5], 'gap 4');
});

test('measures: rectangle, two-piece plant and region edge', () => {
  const w = 100, h = 60, labels = new Int32Array(w * h);
  for (let y = 10; y < 22; y++) for (let x = 10; x < 40; x++) labels[y * w + x] = 1;   // 30 × 12
  for (let y = 30; y < 40; y++) { for (let x = 50; x < 60; x++) labels[y * w + x] = 2; for (let x = 80; x < 90; x++) labels[y * w + x] = 2; }
  for (let y = 50; y < 60; y++) for (let x = 0; x < 5; x++) labels[y * w + x] = 3;
  const mask = all(w * h);
  const [a, b, c] = measurePlants(labels, mask, w, h, {scale: 0.5});
  close(a.area, 360 * 0.25, 1e-9, 'area');
  close(a.perimeter, (84 - 4 * (2 - Math.SQRT2)) * 0.5, 1e-9, 'perimeter');
  close(a.hullArea, 360 * 0.25, 1e-9, 'hull area');
  close(a.compactness, 1, 1e-9, 'compactness');
  close(a.diameter, Math.hypot(30, 12) * 0.5, 1e-9, 'diameter');
  close(a.width, 12 * 0.5, 1e-9, 'width');
  close(a.x, 25 * 0.5, 1e-9, 'centroid');
  // two 10 × 10 squares 20 px apart: the area of both, the hull around both
  assert.equal(b.pieces, 2);
  close(b.area, 200 * 0.25, 1e-9, 'two-piece area');
  close(b.hullArea, 40 * 10 * 0.25, 1e-9, 'two-piece hull');
  close(b.compactness, 0.5, 1e-9, 'two-piece compactness');
  close(b.perimeter, 2 * (40 - 4 * (2 - Math.SQRT2)) * 0.5, 1e-9, 'two-piece perimeter');
  assert.equal(a.edge, false); assert.equal(c.edge, true);
  classify([a, b, c], {excludeEdge: true}, {2: 'excluded'});
  assert.deepEqual([a.status, b.status, c.status], ['ok', 'excluded', 'edge']);
  const s = summarise([a, b, c]);
  assert.equal(s.count, 1); assert.equal(s.left, 2);
  close(s.total, a.area, 1e-9, 'total'); close(s.area.mean, a.area, 1e-9, 'mean');
});

test('detection and measurement of a drawn photograph match the drawn area', () => {
  // two discs of radius 20 (area ≈ 1256.6 px) inside a circular region
  const w = 160, h = 100;
  const rgba = photo(w, h, (x, y) => (x - 50) ** 2 + (y - 50) ** 2 <= 400 || (x - 110) ** 2 + (y - 50) ** 2 <= 400 ? LEAF : null);
  const index = greenIndex(rgba, w, h, whiteReference(rgba, w, h, 1));
  const mask = circleMask(80, 50, 75, 0, 0, w, h);
  const {labels, n} = detectPlants(index, mask, w, h, {threshold: autoThreshold(index, mask), minPx: 10, gapPx: 5});
  assert.equal(n, 2);
  const plants = measurePlants(labels, mask, w, h, {scale: 0.1});
  for (const p of plants) { close(p.area, Math.PI * 400 * 0.01, 0.2, 'disc area'); close(p.diameter, 4, 0.15, 'disc diameter'); }
});

test('corrections: divide along a line, add and erase areas', () => {
  const w = 40, h = 10, labels = new Int32Array(w * h);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 38; x++) labels[y * w + x] = 1;
  assert.equal(plantOnLine(labels, w, h, 20, 0, 20, 9), 1);
  assert.equal(plantOnLine(labels, w, h, 0, 0, 0, 9), 0);
  // a vertical line at x = 20, drawn downwards: the right-hand part (seen from above) becomes plant 2
  assert.ok(splitPlant(labels, w, h, 1, 20, 0, 20, 9, 2));
  assert.equal(labels[5 * w + 10], 1); assert.equal(labels[5 * w + 30], 2);
  // a line beside the plant leaves it whole
  const copy = labels.slice();
  assert.equal(splitPlant(labels, w, h, 1, 0, 0, 0, 9, 3, 1), false);
  assert.deepEqual(labels, copy);
  // adding an area that overlaps plant 2 extends it; an empty area becomes a new plant
  const inside = new Uint8Array(w * h);
  for (let y = 0; y < 2; y++) for (let x = 30; x < 34; x++) inside[y * w + x] = 1;
  inside[5 * w + 31] = 1;
  assert.equal(addArea(labels, all(w * h), inside, 3), 2);
  assert.equal(labels[0 * w + 30], 2);
  const empty = new Uint8Array(w * h); empty[0] = 1;
  assert.equal(addArea(labels, all(w * h), empty, 3), 3);
  eraseArea(labels, empty);
  assert.equal(labels[0], 0);
});

test('plants keep their numbers in the next photograph', () => {
  const old = [{label: 1, x: 10, y: 10}, {label: 2, x: 50, y: 10}, {label: 3, x: 30, y: 40}];
  const fresh = [{label: 1, x: 31, y: 41}, {label: 2, x: 11, y: 9}, {label: 3, x: 52, y: 12}, {label: 4, x: 90, y: 90}];
  const map = matchPlants(old, fresh, 10);
  assert.deepEqual([...map.entries()].sort((a, b) => a[0] - b[0]), [[1, 3], [2, 1], [3, 2], [4, 4]]);
});
