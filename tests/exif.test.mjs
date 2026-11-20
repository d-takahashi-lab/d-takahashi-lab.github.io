import test from 'node:test';
import assert from 'node:assert/strict';
import {exifDate, hoursBetween} from '../src/lib/exif.js';

// A minimal TIFF block: IFD0 with DateTime and a pointer to the Exif IFD, which holds DateTimeOriginal.
function tiffBlock(little, original, plain){
  const b = [], u16 = v => little ? [v & 255, v >> 8] : [v >> 8, v & 255], u32 = v => little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const str = s => [...s].map(c => c.charCodeAt(0)).concat(0);
  // header (8) | IFD0 at 8: 2 entries (2 + 24 + 4 = 30) → 38 | Exif IFD: 1 entry (2 + 12 + 4 = 18) → 56 | strings
  b.push(...(little ? [0x49, 0x49] : [0x4D, 0x4D]), ...u16(42), ...u32(8));
  b.push(...u16(2), ...u16(0x0132), ...u16(2), ...u32(20), ...u32(56), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(38), ...u32(0));
  b.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(76), ...u32(0));
  b.push(...str(plain), ...str(original));
  return b;
}

test('EXIF date: DateTimeOriginal from JPEG (both byte orders) and TIFF; DateTime as fallback', () => {
  for (const little of [true, false]) {
    const t = tiffBlock(little, '2026:10:27 12:49:18', '2026:11:01 08:00:00');
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t], len = app1.length + 2;
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xE1, len >> 8, len & 255, ...app1, 0xFF, 0xDA, 0, 2]);
    assert.equal(exifDate(jpeg), '2026-10-27 12:49:18');
    assert.equal(exifDate(new Uint8Array(t)), '2026-10-27 12:49:18', 'TIFF');
  }
  const noOriginal = tiffBlock(true, '0000:00:00 00:00:00', '2026:11:01 08:00:00');
  assert.equal(exifDate(new Uint8Array(noOriginal)), '2026-11-01 08:00:00');
  assert.equal(exifDate(new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA, 0, 2])), '');
  assert.equal(exifDate(new Uint8Array([0x89, 0x50, 0x4E, 0x47])), '');
});

test('hours between two dates', () => {
  assert.equal(hoursBetween('2026-10-27 12:49:18', '2026-10-28 00:49:18'), 12);
  assert.ok(Number.isNaN(hoursBetween('', '2026-10-28 00:49:18')));
});
