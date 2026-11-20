// Reads the date and time a photograph was taken from its EXIF data (JPEG or TIFF), without any DOM.
// Returns 'YYYY-MM-DD HH:MM:SS' (camera clock, no time zone) or '' when there is none.
// DateTimeOriginal (0x9003) is used first, then DateTimeDigitized (0x9004), then DateTime (0x0132).

export function exifDate(bytes){
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let tiff = -1;
  if (b[0] === 0xFF && b[1] === 0xD8) {
    // JPEG: find the APP1 segment that starts with "Exif\0\0"
    for (let i = 2; i + 4 < b.length;) {
      if (b[i] !== 0xFF) return '';
      const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (marker === 0xDA || marker === 0xD9) return '';
      if (marker === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) { tiff = i + 10; break; }
      i += 2 + len;
    }
  } else if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4D && b[1] === 0x4D)) tiff = 0;
  if (tiff < 0 || tiff + 8 > b.length) return '';
  const little = b[tiff] === 0x49;
  const u16 = o => o + 2 > b.length ? 0 : little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
  const u32 = o => o + 4 > b.length ? 0 : little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 2 ** 24 : b[o] * 2 ** 24 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
  // tag → value offset (from the TIFF header) of every entry in the IFD at offset ifd
  const entries = ifd => {
    const out = new Map(), at = tiff + ifd, n = u16(at);
    for (let k = 0; k < n; k++) {
      const e = at + 2 + k * 12;
      if (e + 12 > b.length) break;
      out.set(u16(e), {type: u16(e + 2), count: u32(e + 4), value: e + 8});
    }
    return out;
  };
  const text = e => {
    if (!e || e.type !== 2 || e.count < 19) return '';
    const o = e.count > 4 ? tiff + u32(e.value) : e.value;
    let s = '';
    for (let k = 0; k < 19 && o + k < b.length; k++) s += String.fromCharCode(b[o + k]);
    const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : '';
  };
  const ifd0 = entries(u32(tiff + 4));
  const exifPtr = ifd0.get(0x8769);
  const exif = exifPtr ? entries(u32(exifPtr.value)) : new Map();
  return text(exif.get(0x9003)) || text(exif.get(0x9004)) || text(ifd0.get(0x0132));
}

// Hours from a to b ('YYYY-MM-DD HH:MM:SS', both in the same clock), or NaN.
export function hoursBetween(a, b){
  const t = s => s ? Date.parse(s.replace(' ', 'T') + 'Z') : NaN;
  return (t(b) - t(a)) / 3.6e6;
}
