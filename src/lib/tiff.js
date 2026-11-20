// Small TIFF reader for microscope images, so TIFF files open in every browser (only Safari decodes TIFF
// natively). Reads the first image of the file: 8-, 16- or 32-bit samples; grey, RGB, palette or
// grey/RGB with alpha; strips or tiles; chunky or planar; no compression, LZW, PackBits or Deflate,
// with or without the horizontal predictor. JPEG-compressed TIFFs and BigTIFF are not supported.
// Images deeper than 8 bits are scaled to 0–255 between the 0.05th and 99.95th percentiles, as a
// microscope viewer's auto-contrast would do.

export class TiffError extends Error {}

const TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8};

export const isTiff = bytes => bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42 && bytes[3] === 0) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 42));

function readIfd(view, le){
  if (view.getUint16(2, le) === 43) throw new TiffError('bigtiff');
  const off = view.getUint32(4, le), n = view.getUint16(off, le), tags = {};
  for (let i = 0; i < n; i++) {
    const e = off + 2 + i * 12, tag = view.getUint16(e, le), type = view.getUint16(e + 2, le), count = view.getUint32(e + 4, le);
    const size = TYPE_SIZE[type];
    if (!size) continue;
    let p = size * count > 4 ? view.getUint32(e + 8, le) : e + 8;
    const values = [];
    for (let k = 0; k < count && p + size <= view.byteLength; k++, p += size) {
      if (type === 3 || type === 8) values.push(type === 3 ? view.getUint16(p, le) : view.getInt16(p, le));
      else if (type === 4 || type === 9) values.push(type === 4 ? view.getUint32(p, le) : view.getInt32(p, le));
      else if (type === 5 || type === 10) values.push((type === 5 ? view.getUint32(p, le) : view.getInt32(p, le)) / (view.getUint32(p + 4, le) || 1));
      else if (type === 11) values.push(view.getFloat32(p, le));
      else if (type === 12) values.push(view.getFloat64(p, le));
      else if (type === 16) values.push(Number(view.getBigUint64(p, le)));
      else values.push(view.getUint8(p));
    }
    tags[tag] = values;
  }
  return tags;
}

/* ---------- Decompression ---------- */
export function lzw(src){
  const out = [];
  let dict = [], bitPos = 0, width = 9, prev = null;
  const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict.push([i]); dict.push(null, null); width = 9; };
  const read = () => {
    let v = 0;
    for (let i = 0; i < width; i++) {
      const byte = src[(bitPos + i) >> 3];
      if (byte === undefined) return 257;
      v = (v << 1) | ((byte >> (7 - ((bitPos + i) & 7))) & 1);
    }
    bitPos += width;
    return v;
  };
  reset();
  for (;;) {
    const code = read();
    if (code === 257) break;
    if (code === 256) { reset(); prev = null; continue; }
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (prev) entry = prev.concat(prev[0]);
    else throw new TiffError('lzw');
    for (const b of entry) out.push(b);
    if (prev) dict.push(prev.concat(entry[0]));
    prev = entry;
    // TIFF's LZW switches to a wider code one entry early
    if (dict.length + 1 >= 1 << width && width < 12) width++;
  }
  return Uint8Array.from(out);
}

export function packBits(src, expected){
  const out = new Uint8Array(expected);
  let i = 0, o = 0;
  while (i < src.length && o < expected) {
    const n = (src[i] << 24) >> 24; i++;
    if (n >= 0) { for (let k = 0; k <= n && o < expected; k++) out[o++] = src[i++]; }
    else if (n !== -128) { const b = src[i++]; for (let k = 0; k < 1 - n && o < expected; k++) out[o++] = b; }
  }
  return out;
}

async function inflate(src){
  const stream = new Blob([src]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------- Decoding ---------- */
export async function decodeTiff(buffer){
  const bytes = new Uint8Array(buffer);
  if (!isTiff(bytes)) throw new TiffError('not-tiff');
  const view = new DataView(buffer), le = bytes[0] === 0x49;
  const t = readIfd(view, le), one = (tag, d) => (t[tag] ? t[tag][0] : d);
  const width = one(256), height = one(257);
  if (!width || !height) throw new TiffError('size');
  const spp = one(277, 1), bits = (t[258] || [1])[0], compression = one(259, 1), photometric = one(262, spp >= 3 ? 2 : 1);
  const planar = one(284, 1), predictor = one(317, 1), format = one(339, 1);
  if (![8, 16, 32].includes(bits) || (t[258] || []).some(b => b !== bits)) throw new TiffError('bits');
  if (![1, 5, 8, 32946, 32773].includes(compression)) throw new TiffError('compression');
  if (bits === 32 && format !== 3 && format !== 1) throw new TiffError('bits');
  const bps = bits / 8;
  const tiled = !!t[322];
  const cw = tiled ? one(322) : width, ch = tiled ? one(323) : Math.min(one(278, height), height);
  const offsets = tiled ? t[324] : t[273], counts = tiled ? t[325] : t[279];
  if (!offsets || !counts) throw new TiffError('layout');
  const across = Math.ceil(width / cw), down = Math.ceil(height / ch), perPlane = across * down;
  const planes = planar === 2 ? spp : 1, chunkSpp = planar === 2 ? 1 : spp;

  // samples[plane][y * width + x] for planar data, or interleaved in plane 0
  const total = width * height * spp;
  const samples = bits === 8 ? new Uint8Array(total) : bits === 16 ? new Uint16Array(total) : new Float32Array(total);
  for (let c = 0; c < offsets.length && c < perPlane * planes; c++) {
    const plane = Math.floor(c / perPlane), k = c % perPlane, cx = (k % across) * cw, cy = Math.floor(k / across) * ch;
    const raw = bytes.subarray(offsets[c], offsets[c] + counts[c]);
    const rowBytes = cw * chunkSpp * bps, expected = rowBytes * ch;
    let data = compression === 1 ? raw : compression === 5 ? lzw(raw) : compression === 32773 ? packBits(raw, expected) : await inflate(raw);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const rows = Math.min(ch, Math.floor(data.length / rowBytes));
    for (let y = 0; y < rows; y++) {
      if (cy + y >= height) break;
      const acc = new Array(chunkSpp).fill(0);
      for (let x = 0; x < cw; x++) {
        for (let s = 0; s < chunkSpp; s++) {
          const p = (y * cw + x) * chunkSpp + s, b = p * bps;
          let v = bits === 8 ? data[b] : bits === 16 ? dv.getUint16(b, le) : format === 3 ? dv.getFloat32(b, le) : dv.getUint32(b, le);
          if (predictor === 2) { v = bits === 8 ? (v + acc[s]) & 0xff : bits === 16 ? (v + acc[s]) & 0xffff : v + acc[s]; acc[s] = v; }
          if (cx + x >= width) continue;
          const pix = (cy + y) * width + cx + x;
          samples[planar === 2 ? pix * spp + plane : pix * spp + s] = v;
        }
      }
    }
  }

  // scale to 8 bits
  const colour = photometric === 2 ? Math.min(3, spp) : 1;
  let to8 = v => v;
  if (bits > 8) {
    const sample = [];
    const step = Math.max(1, Math.floor(width * height / 200000));
    for (let p = 0; p < width * height; p += step) for (let s = 0; s < colour; s++) { const v = samples[p * spp + s]; if (Number.isFinite(v)) sample.push(v); }
    sample.sort((a, b) => a - b);
    const lo = sample[Math.floor(sample.length * 0.0005)] ?? 0, hi = sample[Math.min(sample.length - 1, Math.ceil(sample.length * 0.9995))] ?? 1;
    const k = hi > lo ? 255 / (hi - lo) : 0;
    to8 = v => (v - lo) * k;
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  const map = t[320], mapN = map ? map.length / 3 : 0;
  for (let p = 0; p < width * height; p++) {
    const o = p * 4, i = p * spp;
    if (photometric === 2 && spp >= 3) { rgba[o] = to8(samples[i]); rgba[o + 1] = to8(samples[i + 1]); rgba[o + 2] = to8(samples[i + 2]); }
    else if (photometric === 3 && map) { const j = samples[i]; rgba[o] = map[j] >> 8; rgba[o + 1] = map[mapN + j] >> 8; rgba[o + 2] = map[2 * mapN + j] >> 8; }
    else { let g = to8(samples[i]); if (photometric === 0) g = 255 - g; rgba[o] = rgba[o + 1] = rgba[o + 2] = g; }
    rgba[o + 3] = 255;
  }
  return {width, height, rgba, bits, spp, scaled: bits > 8};
}
