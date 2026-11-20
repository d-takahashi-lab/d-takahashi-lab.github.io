import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {decodeTiff, isTiff, packBits} from '../src/lib/tiff.js';

// Writes a little-endian TIFF. chunks are the already-compressed strips or tiles; tags are added as given.
function tiff(width, height, tags, chunks){
  const entries = Object.entries({256: [3, [width]], 257: [3, [height]], ...tags}).map(([t, v]) => [+t, ...v]).sort((a, b) => a[0] - b[0]);
  const dataStart = 8, offsets = [];
  let pos = dataStart;
  for (const c of chunks) { offsets.push(pos); pos += c.length; }
  const isTiled = entries.some(e => e[0] === 322);
  entries.push([isTiled ? 324 : 273, 4, offsets], [isTiled ? 325 : 279, 4, chunks.map(c => c.length)]);
  entries.sort((a, b) => a[0] - b[0]);
  const ifd = pos + (pos % 2), extra = ifd + 2 + entries.length * 12 + 4;
  const size = TYPE => ({3: 2, 4: 4})[TYPE];
  let extraLen = entries.reduce((n, [, type, vals]) => n + (vals.length * size(type) > 4 ? vals.length * size(type) : 0), 0);
  const buf = new ArrayBuffer(extra + extraLen), v = new DataView(buf), u8 = new Uint8Array(buf);
  u8.set([0x49, 0x49, 42, 0]); v.setUint32(4, ifd, true);
  chunks.forEach((c, i) => u8.set(c, offsets[i]));
  v.setUint16(ifd, entries.length, true);
  let ex = extra;
  entries.forEach(([tag, type, vals], i) => {
    const e = ifd + 2 + i * 12, bytes = vals.length * size(type);
    v.setUint16(e, tag, true); v.setUint16(e + 2, type, true); v.setUint32(e + 4, vals.length, true);
    let p = e + 8;
    if (bytes > 4) { v.setUint32(e + 8, ex, true); p = ex; ex += bytes; }
    vals.forEach((x, k) => type === 3 ? v.setUint16(p + k * 2, x, true) : v.setUint32(p + k * 4, x, true));
  });
  return buf;
}
const pixel = (d, x, y) => Array.from(d.rgba.subarray((y * d.width + x) * 4, (y * d.width + x) * 4 + 4));

test('8-bit RGB, uncompressed and Deflate with the horizontal predictor', async () => {
  const w = 5, h = 3, raw = new Uint8Array(w * h * 3).map((_, i) => (i * 37) % 256);
  const plain = await decodeTiff(tiff(w, h, {258: [3, [8, 8, 8]], 262: [3, [2]], 277: [3, [3]]}, [raw]));
  assert.deepEqual(pixel(plain, 4, 2), [...raw.subarray(42, 45), 255]);
  const diff = raw.slice();
  for (let y = 0; y < h; y++) for (let x = w - 1; x > 0; x--) for (let s = 0; s < 3; s++) { const i = (y * w + x) * 3 + s; diff[i] = (raw[i] - raw[i - 3] + 256) % 256; }
  const zipped = await decodeTiff(tiff(w, h, {258: [3, [8, 8, 8]], 259: [3, [8]], 262: [3, [2]], 277: [3, [3]], 317: [3, [2]]}, [deflateSync(diff)]));
  assert.deepEqual(Array.from(zipped.rgba), Array.from(plain.rgba));
});

test('16-bit grey is scaled to 0–255; WhiteIsZero is inverted', async () => {
  const w = 100, h = 10, raw = new Uint8Array(w * h * 2), v = new DataView(raw.buffer);
  for (let i = 0; i < w * h; i++) v.setUint16(i * 2, 1000 + (i % w) * 30, true);
  const d = await decodeTiff(tiff(w, h, {258: [3, [16]], 262: [3, [1]]}, [raw]));
  assert.equal(d.scaled, true);
  assert.equal(pixel(d, 0, 0)[0], 0); assert.equal(pixel(d, 99, 5)[0], 255);
  assert.ok(Math.abs(pixel(d, 50, 5)[0] - 129) <= 2);
  const inv = await decodeTiff(tiff(2, 1, {258: [3, [8]], 262: [3, [0]]}, [new Uint8Array([0, 200])]));
  assert.deepEqual(pixel(inv, 1, 0), [55, 55, 55, 255]);
});

test('PackBits strips, tiles and planar RGB', async () => {
  const row = new Uint8Array([7, 7, 7, 7, 1, 2, 3]);
  assert.deepEqual(Array.from(packBits(new Uint8Array([253, 7, 2, 1, 2, 3]), 7)), Array.from(row));
  const pb = await decodeTiff(tiff(7, 2, {258: [3, [8]], 259: [3, [32773]], 262: [3, [1]], 278: [3, [1]]}, [new Uint8Array([253, 7, 2, 1, 2, 3]), new Uint8Array([253, 7, 2, 1, 2, 3])]));
  assert.deepEqual([0, 4, 6].map(x => pixel(pb, x, 1)[0]), [7, 1, 3]);
  // a 3 × 3 grey image in 2 × 2 tiles (edge tiles are padded)
  const tiles = [[0, 1, 3, 4], [2, 0, 5, 0], [6, 7, 0, 0], [8, 0, 0, 0]].map(t => new Uint8Array(t));
  const tl = await decodeTiff(tiff(3, 3, {258: [3, [8]], 262: [3, [1]], 322: [3, [2]], 323: [3, [2]]}, tiles));
  assert.deepEqual(Array.from({length: 9}, (_, i) => pixel(tl, i % 3, Math.floor(i / 3))[0]), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const planes = [new Uint8Array([10, 11]), new Uint8Array([20, 21]), new Uint8Array([30, 31])];
  const pl = await decodeTiff(tiff(2, 1, {258: [3, [8, 8, 8]], 262: [3, [2]], 277: [3, [3]], 284: [3, [2]]}, planes));
  assert.deepEqual(pixel(pl, 1, 0), [11, 21, 31, 255]);
});

test('LZW (written by macOS, big-endian) matches the pattern it was made from', async () => {
  const buf = readFileSync(new URL('./fixtures/pattern-lzw.tif', import.meta.url));
  assert.ok(isTiff(buf));
  const d = await decodeTiff(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  assert.equal(d.width, 32); assert.equal(d.height, 24);
  for (const [x, y] of [[0, 0], [31, 0], [5, 7], [31, 23]]) assert.deepEqual(pixel(d, x, y).slice(0, 3), [x * 8, y * 10, (x * y) % 256]);
});

test('unsupported files are refused', async () => {
  await assert.rejects(decodeTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer), {message: 'not-tiff'});
  await assert.rejects(decodeTiff(tiff(1, 1, {258: [3, [8]], 259: [3, [7]]}, [new Uint8Array([0])])), {message: 'compression'});
});
