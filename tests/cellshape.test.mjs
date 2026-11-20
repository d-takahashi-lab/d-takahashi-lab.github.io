import test from 'node:test';
import assert from 'node:assert/strict';
import {measure, segment, polygonMask, polygonArea, splitCells, mergeCells, areAdjacent, classify, summarise, axisDifference, tracedPerimeter, absorbSlivers} from '../src/lib/cellshape.js';
import {shapes, W, H} from './cellshape-shapes.mjs';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const all = (w, h) => new Uint8Array(w * h).fill(1);
const byLabel = cells => Object.fromEntries(cells.map(c => [c.label, c]));

test('rectangle: every measure has its exact value', () => {
  const c = byLabel(measure(shapes(), all(W, H), W, H))[1];
  assert.equal(c.area, 360);
  close(c.perimeter, 84 - 4 * (2 - Math.SQRT2), 1e-9, 'perimeter (ImageJ traced perimeter)');
  close(c.aspect, 30 / 12, 1e-9, 'aspect ratio');
  close(c.major, Math.sqrt(4 * 360 / Math.PI * 2.5), 1e-9, 'major axis');
  close(c.major * c.minor * Math.PI / 4, 360, 1e-9, 'ellipse area equals cell area');
  close(c.angle, 0, 1e-9, 'angle');
  close(c.feret, Math.hypot(30, 12), 1e-9, 'Feret diameter');
  close(c.minFeret, 12, 1e-9, 'minimum Feret');
  close(c.solidity, 1, 1e-9, 'solidity');
  close(c.x, 25, 1e-9, 'centroid x'); close(c.y, 16, 1e-9, 'centroid y');
});

test('rotated ellipse, disc and star have the expected shape', () => {
  const c = byLabel(measure(shapes(), all(W, H), W, H));
  close(c[2].angle, 30, 0.5, 'ellipse angle (counter-clockwise)');
  close(c[2].aspect, 40 / 15, 0.05, 'ellipse aspect ratio');
  close(c[2].area, Math.PI * 40 * 15, 20, 'ellipse area');
  close(c[3].area, Math.PI * 625, 20, 'disc area');
  assert.ok(c[3].aspect < 1.02 && c[3].circularity > 0.88 && c[3].solidity > 0.97, 'disc is round');
  close(c[3].feret, 50, 1.5, 'disc Feret'); close(c[3].minFeret, 50, 1.5, 'disc minimum Feret');
  assert.ok(c[4].solidity < 0.7 && c[4].circularity < 0.5, 'star is concave');
  assert.ok(c[5].solidity < 0.75, 'L shape is concave');
});

test('traced outlines enclose exactly the pixels of each cell', () => {
  for (const c of measure(shapes(), all(W, H), W, H)) assert.equal(polygonArea(c.outline), c.px, `label ${c.label}`);
});

test('scale converts lengths and areas to µm; angle to the surface is folded into 0–90°', () => {
  const c = byLabel(measure(shapes(), all(W, H), W, H, {scale: 0.5, refAngle: 90}))[1];
  assert.equal(c.area, 90);
  close(c.feret, Math.hypot(15, 6), 1e-9, 'Feret in µm');
  assert.equal(c.surfaceAngle, 90);
  assert.equal(axisDifference(170, 10), 20);
  assert.equal(axisDifference(10, 100), 90);
  assert.equal(tracedPerimeter([[0, 0], [2, 0], [2, 2], [0, 2]]), 8 - 4 * (2 - Math.SQRT2));
});

test('region mask matches the polygon area; edge cells are flagged', () => {
  const poly = [[3.2, 4.7], [180.4, 20.1], [150.6, 140.3], [20.5, 120.9]];
  const mask = polygonMask(poly, 0, 0, 200, 160);
  close(mask.reduce((a, b) => a + b, 0), polygonArea(poly), polygonArea(poly) * 0.01, 'mask area');
  const labels = new Int32Array(200 * 160);
  for (let i = 0; i < labels.length; i++) labels[i] = mask[i] ? (i % 200 < 80 ? 1 : 2) : 0;
  for (let y = 60; y < 70; y++) for (let x = 90; x < 100; x++) labels[y * 200 + x] = 3;
  const c = byLabel(measure(labels, mask, 200, 160));
  assert.ok(c[1].edge && c[2].edge && !c[3].edge);
});

// A grid of 5 × 4 cells, 40 px apart, with 3-px bright walls and some noise.
function grid(){
  const w = 200, h = 160, img = new Float32Array(w * h);
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wall = x % 40 < 3 || y % 40 < 3;
    img[y * w + x] = (wall ? 0.8 : 0.2) + (rand() - 0.5) * 0.2;
  }
  return {img, w, h};
}

test('segmentation finds one cell per compartment', () => {
  const {img, w, h} = grid();
  // leave out the outer wall row and column so every compartment is whole
  const mask = polygonMask([[3, 3], [200, 3], [200, 160], [3, 160]], 0, 0, w, h);
  const {labels} = segment(img, mask, w, h, {diameter: 40, split: 5});
  const cells = measure(labels, mask, w, h);
  assert.equal(cells.length, 20);
  for (const c of cells) assert.ok(c.area > 33 * 33 && c.area < 44 * 44, `area ${c.area}`);
});

test('a cell can be split along a line and merged again', () => {
  const w = 60, h = 30, labels = new Int32Array(w * h);
  for (let y = 5; y < 25; y++) for (let x = 10; x < 50; x++) labels[y * w + x] = 1;
  const created = splitCells(labels, w, h, 30.5, 0, 30.5, 29, 2);
  assert.deepEqual(created, [[1, 2]]);
  const cells = byLabel(measure(labels, all(w, h), w, h));
  assert.equal(cells[1].area + cells[2].area, 800);
  assert.ok(Math.abs(cells[1].area - cells[2].area) <= 40); // the line itself (20 px) joins one side
  assert.ok(areAdjacent(labels, w, h, 1, 2));
  mergeCells(labels, 1, 2);
  assert.equal(measure(labels, all(w, h), w, h).length, 1);
});

test('only the chosen cell is cut when the line crosses its neighbour too', () => {
  const w = 60, h = 30, labels = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) labels[y * w + x] = x < 30 ? 1 : 2;
  assert.deepEqual(splitCells(labels, w, h, -1, 15.5, 61, 15.5, 3, 20, 1), [[1, 3]]);
  assert.deepEqual([...new Set(labels)].sort(), [1, 2, 3]);
  assert.equal(labels.filter(v => v === 2).length, 900);
});

test('slivers join the neighbour they share the longest border with', () => {
  const w = 10, h = 10, labels = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) labels[y * w + x] = x < 5 ? 1 : 2;
  labels[4 * w + 4] = 3; labels[4 * w + 5] = 3; // two pixels: three sides touch 1 or 2 each, tie broken by first seen
  labels[9 * w + 9] = 4;                       // corner pixel inside 2
  absorbSlivers(labels, w, h, 4);
  assert.deepEqual([...new Set(labels)].sort(), [1, 2]);
  assert.equal(labels[9 * w + 9], 2);
});

test('classification and summary', () => {
  const cells = [
    {label: 1, area: 100, edge: false}, {label: 2, area: 300, edge: false}, {label: 3, area: 5, edge: false},
    {label: 4, area: 200, edge: true}, {label: 5, area: 400, edge: false},
  ];
  classify(cells, {minArea: 10, excludeEdge: true}, {5: 'space'});
  assert.deepEqual(cells.map(c => c.status), ['ok', 'ok', 'small', 'edge', 'space']);
  const s = summarise(cells, 4000);
  assert.equal(s.measured, 2); assert.equal(s.counted, 3);
  assert.equal(s.area.mean, 200); close(s.area.sd, Math.SQRT2 * 100, 1e-9, 'sd');
  assert.equal(s.spaceFraction, 0.1);
  assert.equal(s.density, 3 / 4000 * 1e6);
});
