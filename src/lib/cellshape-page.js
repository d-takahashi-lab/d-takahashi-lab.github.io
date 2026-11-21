// Browser side of the Cell Shape tool: loads the image, lets the user draw regions and correct cells,
// and shows, saves and copies the results. All image analysis lives in cellshape.js.
// The page language comes from <html lang>.
import {decodeTiff, isTiff} from './tiff.js';
import {VERSION, toGray, polygonMask, segment, measure, classify, summarise, splitCells, autoSplit, mergeCells, areAdjacent, drawCell} from './cellshape.js';

const root = document.getElementById('cs');
const en = document.documentElement.lang === 'en';
const $ = id => document.getElementById('cs-' + id);

// Region names are free text; regions with the same name share a colour.
const REGION_COLORS = ['#2B6684', '#5E8B2A', '#B07D12', '#9A4A8C', '#A2402F', '#3F7F73', '#626262'];
const roiColor = r => { const names = [...new Set(S.rois.map(x => x.name.trim()))]; return REGION_COLORS[names.indexOf(r.name.trim()) % REGION_COLORS.length]; };
const roiLabel = r => r.name.trim() ? `${r.id} ${r.name.trim()}` : String(r.id);
const TEXT = en ? {
  status: {ok: 'Measured', edge: 'Touches the region edge', small: 'Below the minimum area', large: 'Above the maximum area', excluded: 'Left out by hand', space: 'Intercellular space'},
  imageInfo: (name, w, h) => `${name} — ${w} × ${h} px`,
  cannotRead: 'This image could not be read. Please use TIFF, PNG or JPEG.',
  loading: 'Loading the image…',
  scaledTiff: bits => `This is a ${bits}-bit image: brightness was scaled to 8 bits for display and analysis (0.05–99.95th percentile).`,
  tiffErrors: {bigtiff: 'BigTIFF files cannot be read. Save the image as an ordinary TIFF or PNG.', compression: 'This TIFF uses a compression that cannot be read here (e.g. JPEG). Save it uncompressed, with LZW, or as PNG.', bits: 'Only 8-, 16- and 32-bit TIFF images can be read.'},
  exampleLoaded: e => `Example image loaded: a cross-section with a vascular bundle in the middle, fluorescence, 10× objective. The scale (${e.barUm} µm = ${e.barPx} px) and a cell diameter are already set. Name and outline a region (step 3).`,
  replace: 'Load a new image? The regions drawn on the current image will be discarded.',
  needImage: 'Choose an image first.',
  needScale: 'Set the scale first (step 2): trace the scale bar or type the pixel size.',
  needRoi: 'Outline a region first (step 3).',
  tooSmallRoi: 'The region is too small.',
  tooSmallCell: 'The typical cell diameter is smaller than 4 pixels. Check the scale and the diameter.',
  detecting: 'Detecting cells…',
  scaleSet: (px, um, s) => `Scale bar: ${px.toFixed(1)} px = ${um} µm → ${fmtSig(s)} µm per pixel`,
  scaleSaved: 'Using the pixel size from your last session in this browser. Check it matches this image.',
  notAdjacent: 'These two cells do not touch. Choose neighbouring cells.',
  noSplit: 'The line did not cut a cell into two. Draw it right across one cell, from wall to wall, with its middle inside that cell.',
  noAuto: 'No wall was found inside this cell. Cut it with “Cut along a line”, drawing the line along the wall.',
  nothingToUndo: 'Nothing to undo.',
  deleteRoi: n => `Delete region ${n}?`,
  roiItem: (n, cells) => `Region ${n}${cells == null ? '' : ` — ${cells} cell${cells === 1 ? '' : 's'}`}`,
  nameOf: n => `Name of region ${n}`,
  remove: 'Delete',
  wheel: key => `Hold ${key} and scroll to zoom`,
  noDraw: 'The outline must lie inside a region. Outline a region first (step 3).',
  hints: {
    none: '',
    scale: 'Click the two ends of the scale bar.',
    roi: 'Click to place corners; click the first point, double-click or press Enter to close. Then outline the next region. Esc cancels the outline being drawn; press Esc again, the button, or choose a correction to finish.',
    info: 'Click a cell to see its values. Drag to move; ⌘ (Ctrl) + scroll to zoom.',
    exclude: 'Click a cell to leave it out of the measurements; click again to include it.',
    space: 'Click a compartment to mark it as intercellular space; click again to unmark it.',
    merge: 'Click the two cells to join, one after the other.',
    mergeSecond: 'Now click the neighbouring cell to join.',
    auto: 'Click a cell that is really two or three cells: it is split along the faint walls inside it. Click a piece again to split it further.',
    split: 'Click the two ends of a line along the wall between the cells, reaching the outline at both ends. The cut follows the nearest wall; only the cell under the middle of the line is cut.',
    draw: 'Click around the cell’s outline; click the first point, double-click or press Enter to finish. Esc cancels.',
  },
  legend: (name, lo, hi, unit) => `${name}: ${lo} – ${hi}${unit}`,
  greyNote: 'Grey: detected but not measured (cut by the region edge, outside the area range, or left out by hand). Blue: intercellular space.',
  copied: 'Copied',
  cols: {image: 'Image', region: 'Region', name: 'Name', cell: 'Cell', status: 'Status', count: 'Cells', tissueArea: 'Tissue area (µm²)', frame: 'Region drawn around', whole: 'Whole cells', cut: 'Cells cut by the edge', measured: 'Cells measured', density: 'Cell density (/mm²)', space: 'Intercellular space (%)', roiArea: 'Region area (µm²)', angle: 'Angle (°)', feretAngle: 'Feret angle (°)', x: 'Centroid x (µm)', y: 'Centroid y (µm)', pixel: 'Pixel size (µm)', diameter: 'Typical cell diameter (µm)', split: 'Splitting', smooth: 'Outline smoothing', faces: 'Wall-face cells searched', minArea: 'Minimum area (µm²)', maxArea: 'Maximum area (µm²)', edge: 'Edge cells excluded', version: 'Tool version', date: 'Date analysed'},
  stat: {mean: 'mean', sd: 'SD', median: 'median'},
  yes: 'yes', no: 'no',
  frames: {tissue: 'whole tissue', part: 'part of a tissue'},
  footer: (v, url, date, image, scale) => `Analysed with Cell Shape Analyzer version ${v} (${url}) on ${date}. Image: ${image}; pixel size ${fmtSig(scale)} µm.`,
} : {
  status: {ok: '計測', edge: '領域の縁にかかる', small: '最小面積より小さい', large: '最大面積より大きい', excluded: '手で除外', space: '細胞間隙'},
  imageInfo: (name, w, h) => `${name}（${w} × ${h} ピクセル）`,
  cannotRead: 'この画像は読み込めません。TIFF・PNG・JPEGのいずれかを使ってください。',
  loading: '画像を読み込んでいます…',
  scaledTiff: bits => `${bits}ビットの画像なので、明るさを8ビットに変換して表示・解析します（0.05〜99.95パーセンタイルの範囲）。`,
  tiffErrors: {bigtiff: 'BigTIFF形式は読み込めません。通常のTIFFかPNGで保存し直してください。', compression: 'このTIFFの圧縮形式（JPEG圧縮など）は読み込めません。無圧縮・LZW圧縮のTIFFかPNGで保存し直してください。', bits: '8・16・32ビットのTIFFだけが読み込めます。'},
  exampleLoaded: e => `例の画像（中央に維管束がある横断切片の蛍光像、10倍対物レンズ）を読み込みました。スケール（${e.barUm} µm = ${e.barPx}ピクセル）と細胞の直径の目安は設定済みです。手順3で名前を付けて、領域を囲んでみてください。`,
  replace: '新しい画像を読み込みますか？ 今の画像に描いた領域は消えます。',
  needImage: '先に画像を選んでください。',
  needScale: '先にスケールを決めてください（手順2）。スケールバーをなぞるか、1ピクセルの長さを入力します。',
  needRoi: '先に領域を囲んでください（手順3）。',
  tooSmallRoi: '領域が小さすぎます。',
  tooSmallCell: '細胞の直径の目安が4ピクセルより小さくなっています。スケールと直径を確かめてください。',
  detecting: '細胞を検出しています…',
  scaleSet: (px, um, s) => `スケールバー：${px.toFixed(1)}ピクセル = ${um} µm → 1ピクセル ${fmtSig(s)} µm`,
  scaleSaved: 'このブラウザで前回使った値を入れています。この画像に合っているか確かめてください。',
  notAdjacent: 'この2つの細胞は接していません。隣り合う細胞を選んでください。',
  noSplit: '線で細胞が2つに分かれませんでした。1つの細胞を横切るように、壁から壁まで線を引いてください（線の中点がその細胞の中に来るようにします）。',
  noAuto: 'この細胞の中に壁が見つかりませんでした。「線を引いて切り分ける」で、壁に沿って線を引いてください。',
  nothingToUndo: '元に戻す操作はありません。',
  deleteRoi: n => `領域${n}を削除しますか？`,
  roiItem: (n, cells) => `領域${n}${cells == null ? '' : `（${cells}細胞）`}`,
  nameOf: n => `領域${n}の名前`,
  remove: '削除',
  wheel: key => `${key}キーを押しながらスクロールすると拡大・縮小します`,
  noDraw: '輪郭は領域の中に描いてください。先に領域を囲みます（手順3）。',
  hints: {
    none: '',
    scale: 'スケールバーの両端をクリックしてください。',
    roi: 'クリックで角を置き、最初の点のクリック・ダブルクリック・Enterキーで閉じます。続けて次の領域を囲めます。Escキーで描きかけを取り消し、もう一度Escキーかボタンを押すか、手直しの種類を選ぶと終わります。',
    info: '細胞をクリックすると値を表示します。ドラッグで移動、⌘（Ctrl）キー＋スクロールで拡大・縮小します。',
    exclude: 'クリックした細胞を計測から外します。もう一度クリックすると戻します。',
    space: 'クリックした区画を細胞間隙にします。もう一度クリックすると戻します。',
    merge: 'つなぐ2つの細胞を順にクリックしてください。',
    mergeSecond: '隣のつなぐ細胞をクリックしてください。',
    auto: '2〜3個がつながった細胞をクリックすると、中の薄い壁を探して自動で分けます。分け足りない部分は、もう一度クリックします。',
    split: '細胞の間の壁に沿って、輪郭から輪郭まで線の両端をクリックしてください。近くの壁に沿って切り分けます（線の中点にある細胞だけを切ります）。',
    draw: '細胞の輪郭に沿ってクリックしていき、最初の点のクリック・ダブルクリック・Enterキーで閉じます。Escキーで取り消します。',
  },
  legend: (name, lo, hi, unit) => `${name}：${lo} – ${hi}${unit}`,
  greyNote: '灰色：検出したが計測していない細胞（領域の縁にかかる・面積が範囲外・手で除外）。青：細胞間隙。',
  copied: 'コピーしました',
  cols: {image: '画像', region: '領域', name: '名前', cell: '番号', status: '状態', count: '細胞数', tissueArea: '組織の面積 (µm²)', frame: '領域の描き方', whole: '縁にかからない細胞', cut: '縁にかかる細胞', measured: '計測数', density: '細胞密度 (/mm²)', space: '細胞間隙 (%)', roiArea: '領域の面積 (µm²)', angle: '角度 (°)', feretAngle: 'フェレ径の角度 (°)', x: '重心 x (µm)', y: '重心 y (µm)', pixel: '1ピクセルの長さ (µm)', diameter: '細胞の直径の目安 (µm)', split: '分け方', smooth: '輪郭のなめらかさ', faces: '面の細胞を探した', minArea: '最小面積 (µm²)', maxArea: '最大面積 (µm²)', edge: '縁の細胞を除外', version: 'ツールのバージョン', date: '解析日'},
  stat: {mean: '平均', sd: '標準偏差', median: '中央値'},
  yes: 'はい', no: 'いいえ',
  frames: {tissue: '組織全体', part: '組織の一部'},
  footer: (v, url, date, image, scale) => `Cell Shape Analyzer バージョン${v}（${url}）で${date}に解析。画像：${image}、1ピクセル ${fmtSig(scale)} µm。`,
};

// The measures, in the order used everywhere: the cell panel, the results table, both CSV files and the
// copied table all take their columns, names and units from this one list.
const MEASURES = [
  {key: 'area', ja: '面積', en: 'Area', unit: 'µm²', d: 1},
  {key: 'perimeter', ja: '周囲長', en: 'Perimeter', unit: 'µm', d: 1},
  {key: 'pa', ja: 'P/A', en: 'P/A', unit: 'µm⁻¹', d: 4},
  {key: 'major', ja: '長径', en: 'Major axis', unit: 'µm', d: 1},
  {key: 'minor', ja: '短径', en: 'Minor axis', unit: 'µm', d: 1},
  {key: 'aspect', ja: '縦横比', en: 'Aspect ratio', d: 2},
  {key: 'circularity', ja: '円形度', en: 'Circularity', d: 3},
  {key: 'roundness', ja: '真円度', en: 'Roundness', d: 3},
  {key: 'solidity', ja: '充実度', en: 'Solidity', d: 3},
  {key: 'fractal', ja: 'フラクタル次元', en: 'Fractal dimension', d: 3},
  {key: 'feret', ja: 'フェレ径', en: 'Feret diameter', unit: 'µm', d: 1},
  {key: 'minFeret', ja: '最小フェレ径', en: 'Min. Feret diameter', unit: 'µm', d: 1},
];
const BY_KEY = Object.fromEntries(MEASURES.map(m => [m.key, m]));
const mName = m => en ? m.en : m.ja;
const mLabel = m => m.unit ? `${mName(m)} (${m.unit})` : mName(m);
const RAMP = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
const FONT = 'Arial, Hiragino Kaku Gothic ProN, Yu Gothic, sans-serif';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function fmtSig(v){ return Number.isFinite(v) ? String(Number(v.toPrecision(4))) : '—'; }
const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '—';
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const num = id => { const v = parseFloat($(id).value); return Number.isFinite(v) && v > 0 ? v : NaN; };

/* ---------- State ---------- */
const S = {
  img: null,                 // {w, h, name, canvas, rgba}
  scale: NaN,                // µm per pixel
  rois: [], sel: -1, nextId: 1,
  tool: null,                // 'scale' | 'roi' while drawing
  pts: [],                   // points of the line or polygon being drawn (image coordinates)
  hover: null,
  pick: null,                // {roi, label}: cell shown in the info panel or first cell to join
  view: {k: 1, ox: 0, oy: 0, fit: 1},
};
let history = [];            // undo snapshots: {roi, labels, manual, next}

try { const s = parseFloat(localStorage.getItem('cellshape-scale')); if (s > 0) { S.scale = s; $('scale').value = fmtSig(s); } } catch {}

/* ---------- Canvas ---------- */
const canvas = $('canvas'), ctx = canvas.getContext('2d'), viewer = $('viewer');
let dpr = 1, raf = 0;
const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
// The viewer is as tall as the image needs at its width, but leaves room in the window for the toolbar
// and the hint, as the whole column stays on screen while the steps on the left are scrolled.
function sizeViewer(){
  if (!S.img) return;
  const h = Math.max(320, Math.min(window.innerHeight - 150, viewer.clientWidth * S.img.h / S.img.w + 2));
  viewer.style.height = `${Math.round(h)}px`;
}
window.addEventListener('resize', sizeViewer);
function resize(){
  sizeViewer();
  dpr = window.devicePixelRatio || 1;
  const r = viewer.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  if (S.img && !S.view.touched) fit();
  draw();
}
new ResizeObserver(resize).observe(viewer);
const toImage = (sx, sy) => [(sx - S.view.ox) / S.view.k, (sy - S.view.oy) / S.view.k];
const toScreen = (ix, iy) => [ix * S.view.k + S.view.ox, iy * S.view.k + S.view.oy];

function fit(){
  if (!S.img) return;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const k = Math.min(W / S.img.w, H / S.img.h) * 0.98;
  S.view = {k, fit: k, ox: (W - S.img.w * k) / 2, oy: (H - S.img.h * k) / 2, touched: false};
  redraw();
}
function zoomAt(sx, sy, f){
  const v = S.view, k = Math.min(32, Math.max(v.fit * 0.5, v.k * f));
  v.ox = sx - (sx - v.ox) * k / v.k; v.oy = sy - (sy - v.oy) * k / v.k; v.k = k; v.touched = true;
  redraw();
}

function draw(){
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#f5f5f3'; ctx.fillRect(0, 0, W, H);
  if (!S.img) return;
  const {k, ox, oy} = S.view;
  ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k);
  ctx.imageSmoothingEnabled = k < 2;
  ctx.drawImage(S.img.canvas, 0, 0);
  S.rois.forEach(r => { if (r.overlay) ctx.drawImage(r.overlay, r.x0, r.y0); });
  ctx.restore();
  drawVectors(ctx, toScreen, 1, W, H);
  // the line or polygon being drawn
  if (S.pts.length && (S.tool || mode() === 'split' || mode() === 'draw')) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath();
    S.pts.forEach((p, i) => { const [x, y] = toScreen(...p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    if (S.hover) ctx.lineTo(...toScreen(...S.hover));
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3; ctx.stroke(); ctx.shadowBlur = 0;
    S.pts.forEach((p, i) => { const [x, y] = toScreen(...p); ctx.fillStyle = i ? '#ffffff' : '#ffd400'; ctx.fillRect(x - 3, y - 3, 6, 6); });
  }
}

// Region outlines, cell numbers and the picked cell, in the coordinates given by map (screen or image).
function drawVectors(g, map, unit, W, H){
  S.rois.forEach((r, i) => {
    const col = roiColor(r);
    g.beginPath();
    r.poly.forEach((p, j) => { const [x, y] = map(...p); j ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath();
    g.lineWidth = (i === S.sel ? 3 : 2) * unit; g.strokeStyle = '#ffffff'; g.setLineDash([]); g.stroke();
    g.lineWidth = (i === S.sel ? 2 : 1.2) * unit; g.strokeStyle = col; g.stroke();
    const [tx, ty] = map(...r.poly[0]);
    const label = roiLabel(r);
    g.font = `700 ${13 * unit}px ${FONT}`;
    const tw = g.measureText(label).width;
    g.fillStyle = col; g.fillRect(tx, ty - 20 * unit, tw + 10 * unit, 20 * unit);
    g.fillStyle = '#ffffff'; g.fillText(label, tx + 5 * unit, ty - 6 * unit);
  });
  if ($('show-number').checked) {
    g.font = `${11 * unit}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    S.rois.forEach(r => r.cells.forEach(c => {
      const [x, y] = map(c.x / S.scale, c.y / S.scale);
      if (W && (x < 0 || y < 0 || x > W || y > H)) return;
      if (unit === 1 && Math.sqrt(c.px) * S.view.k < 18) return;
      g.lineWidth = 3 * unit; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(String(c.label), x, y);
      g.fillStyle = '#ffffff'; g.fillText(String(c.label), x, y);
    }));
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }
  const c = pickedCell();
  if (c && unit === 1) {
    g.beginPath();
    c.outline.forEach((p, j) => { const [x, y] = map(...p); j ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.lineWidth = 3; g.strokeStyle = '#ffd400'; g.stroke();
  }
}
const pickedCell = () => S.pick && S.rois.includes(S.pick.roi) ? S.pick.roi.byLabel?.get(S.pick.label) : null;

/* ---------- Overlay colours ---------- */
function hsl(h, s, l){
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
function ramp(t){
  t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t)), u = t - i;
  return RAMP[i].map((v, j) => Math.round(v + (RAMP[i + 1][j] - v) * u));
}
// Range of the colour scale: 5th to 95th percentile of measured cells in all regions.
function colorRange(metric){
  const v = S.rois.flatMap(r => r.cells.filter(c => c.status === 'ok').map(c => c[metric])).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = p => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  let lo = q(0.05), hi = q(0.95);
  if (!(hi > lo)) hi = lo + 1;
  return {lo, hi};
}
function renderAll(){
  const metric = $('color').value, range = metric === 'cell' ? null : colorRange(metric);
  S.rois.forEach(r => renderOverlay(r, metric, range));
  const legend = $('legend');
  // Cells that are not measured are drawn in grey, which is easy to mistake for missed cells.
  const grey = S.rois.some(r => r.cells.some(c => c.status !== 'ok'));
  let html = '';
  if (range) {
    const m = BY_KEY[metric];
    html = `<span class="cs-ramp"></span>${esc(TEXT.legend(mName(m), range.lo.toFixed(m.d), range.hi.toFixed(m.d), m.unit ? ` ${m.unit}` : ''))}`;
  }
  if (grey) html += `${html ? '<br/>' : ''}${esc(TEXT.greyNote)}`;
  legend.innerHTML = html;
  legend.hidden = !html;
  redraw();
}
function renderOverlay(r, metric, range){
  if (!r.labels) { r.overlay = null; return; }
  const {w, h, labels} = r, fill = $('show-fill').checked, lines = $('show-line').checked;
  const colors = new Map();
  for (const c of r.cells) {
    let rgb, a = 95, line = [255, 255, 255, 235];
    if (c.status === 'space') { rgb = [70, 130, 230]; a = 120; line = [150, 190, 255, 220]; }
    else if (c.status !== 'ok') { rgb = [150, 150, 150]; a = 45; line = [190, 190, 190, 150]; }
    else if (range) { rgb = ramp((c[metric] - range.lo) / (range.hi - range.lo)); a = 150; }
    else rgb = hsl((c.label * 137.508) % 360, 0.75, 0.55);
    colors.set(c.label, {fill: [...rgb, fill ? a : 0], line});
  }
  const cv = r.overlay || document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const L = labels[i];
    if (!L) continue;
    const col = colors.get(L);
    if (!col) continue;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || labels[i - 1] !== L || labels[i + 1] !== L || labels[i - w] !== L || labels[i + w] !== L;
    const c = edge && lines ? col.line : col.fill;
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3];
  }
  g.putImageData(im, 0, 0);
  r.overlay = cv;
}

/* ---------- Image ---------- */
// Reads a TIFF with tiff.js (every browser) and other formats with the browser's own decoder.
async function readImage(file){
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (isTiff(head)) {
    try {
      const d = await decodeTiff(await file.arrayBuffer());
      const c = document.createElement('canvas'); c.width = d.width; c.height = d.height;
      c.getContext('2d').putImageData(new ImageData(d.rgba, d.width, d.height), 0, 0);
      return {canvas: c, rgba: d.rgba, w: d.width, h: d.height, note: d.scaled ? TEXT.scaledTiff(d.bits) : ''};
    } catch (e) { throw new Error(TEXT.tiffErrors[e.message] || TEXT.cannotRead); }
  }
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    try {
      const url = URL.createObjectURL(file), im = new Image();
      im.src = url; await im.decode(); src = im;
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { throw new Error(TEXT.cannotRead); }
  }
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', {willReadFrequently: true});
  g.drawImage(src, 0, 0);
  return {canvas: c, rgba: g.getImageData(0, 0, w, h).data, w, h, note: ''};
}
async function loadFile(file, example){
  if (!file) return;
  if (S.rois.length && !confirm(TEXT.replace)) return;
  message(TEXT.loading);
  let im;
  try { im = await readImage(file); } catch (e) { message(e.message); return; }
  S.img = {w: im.w, h: im.h, name: file.name, canvas: im.canvas, rgba: im.rgba};
  S.rois = []; S.sel = -1; S.nextId = 1; S.tool = null; S.pts = []; S.pick = null; history = [];
  $('drop').hidden = true;
  sizeViewer();
  $('image-info').textContent = TEXT.imageInfo(file.name, im.w, im.h);
  ['draw-scale', 'draw-roi', 'detect'].forEach(id => { $(id).disabled = false; });
  $('modes').disabled = false;
  if (example) {
    // settings of the example come from the button's data attributes; its scale is not remembered as
    // the user's own
    S.scale = example.barUm / example.barPx; $('scale').value = fmtSig(S.scale); $('bar').value = example.barUm;
    $('diameter').value = example.diameter; $('faces').checked = example.faces === 'true';
    message(TEXT.exampleLoaded(example));
  } else message([im.note, S.scale > 0 ? TEXT.scaleSaved : ''].filter(Boolean).join('\n'));
  fit(); refresh();
}
$('example').addEventListener('click', async e => {
  const button = e.currentTarget;
  button.disabled = true;
  try {
    const res = await fetch(button.dataset.src);
    if (!res.ok) throw new Error();
    const {barUm, barPx, diameter, faces} = button.dataset;
    await loadFile(new File([await res.blob()], 'example-section.webp', {type: 'image/webp'}), {barUm: +barUm, barPx: +barPx, diameter: +diameter, faces});
  } catch { message(TEXT.cannotRead); }
  button.disabled = false;
});
$('file').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
viewer.addEventListener('dragover', e => { e.preventDefault(); viewer.classList.add('is-drag'); });
viewer.addEventListener('dragleave', () => viewer.classList.remove('is-drag'));
viewer.addEventListener('drop', e => { e.preventDefault(); viewer.classList.remove('is-drag'); loadFile(e.dataTransfer.files[0]); });

/* ---------- Regions ---------- */
function params(){
  return {frame: document.querySelector('input[name=cs-frame]:checked').value, diameter: num('diameter'), split: +$('split').value, smooth: +$('smooth').value, faces: $('faces').checked, minArea: num('min'), maxArea: num('max'), excludeEdge: $('edge').checked};
}
function setParams(p){
  $('diameter').value = p.diameter; $('split').value = p.split; $('split-out').value = p.split;
  $('smooth').value = p.smooth; $('smooth-out').value = p.smooth;
  document.querySelector(`input[name=cs-frame][value=${p.frame || 'tissue'}]`).checked = true;
  $('min').value = Number.isFinite(p.minArea) ? p.minArea : ''; $('max').value = Number.isFinite(p.maxArea) ? p.maxArea : '';
  $('edge').checked = p.excludeEdge; $('faces').checked = !!p.faces;
}
function addRoi(poly){
  const {w: W, h: H} = S.img;
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(W, Math.ceil(Math.max(...xs))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) { message(TEXT.tooSmallRoi); return; }
  const mask = polygonMask(poly, x0, y0, w, h);
  let area = 0; for (const v of mask) area += v;
  if (area < 50) { message(TEXT.tooSmallRoi); return; }
  const roi = {id: S.nextId++, name: $('name').value.trim(), poly, x0, y0, w, h, mask, area, labels: null, manual: {}, cells: [], byLabel: new Map(), next: 1, params: params()};
  S.rois.push(roi); S.sel = S.rois.length - 1;
  refresh();
  detect(roi);
}
function select(i){
  S.sel = i;
  const r = S.rois[i];
  if (r) setParams(r.params);
  refresh();
}
function removeRoi(i){
  const r = S.rois[i];
  if (!confirm(TEXT.deleteRoi(r.id))) return;
  S.rois.splice(i, 1);
  history = history.filter(h => h.roi !== r);
  if (S.pick?.roi === r) S.pick = null;
  S.sel = Math.min(S.sel, S.rois.length - 1);
  refresh(); renderAll();
}
function renderRoiList(){
  const ul = $('rois');
  ul.innerHTML = S.rois.map((r, i) => `<li class="${i === S.sel ? 'is-selected' : ''}">
    <button type="button" class="cs-roi" data-i="${i}" aria-pressed="${i === S.sel}"><span class="cs-swatch" style="background:${roiColor(r)}"></span>${esc(TEXT.roiItem(r.id, r.labels ? Math.round(summarise(r.cells, r.area * S.scale * S.scale, r.params.frame).count * 10) / 10 : null))}</button>
    <input type="text" class="cs-roi-name" data-name="${i}" list="cs-names" autocomplete="off" value="${esc(r.name)}" aria-label="${esc(TEXT.nameOf(r.id))}"/>
    <button type="button" class="cs-remove" data-remove="${i}">${TEXT.remove}</button></li>`).join('');
}
$('rois').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.remove != null) removeRoi(+b.dataset.remove); else select(+b.dataset.i);
});
// Each region keeps its own name; the name box above is for the next region. The image follows
// while typing; the list and table are rebuilt when the edit is finished (so the box keeps focus).
$('rois').addEventListener('input', e => {
  const i = e.target.dataset.name;
  if (i == null) return;
  S.rois[+i].name = e.target.value;
  redraw();
});
$('rois').addEventListener('change', e => {
  const i = e.target.dataset.name;
  if (i == null) return;
  S.rois[+i].name = e.target.value.trim();
  refresh(); redraw();
});
// How the region was drawn only changes the counting.
document.querySelectorAll('input[name=cs-frame]').forEach(el => el.addEventListener('change', () => {
  const r = S.rois[S.sel];
  if (r) { r.params = params(); refresh(); }
}));
// Settings belong to the selected region; they take effect when cells are detected again,
// except the area limits and the edge rule, which only change the classification.
['diameter', 'split', 'smooth', 'faces', 'min', 'max', 'edge'].forEach(id => $(id).addEventListener('input', () => {
  $('split-out').value = $('split').value; $('smooth-out').value = $('smooth').value;
  const r = S.rois[S.sel];
  if (!r) return;
  r.params = params();
  if (['min', 'max', 'edge'].includes(id) && r.labels) remeasure(r);
}));

/* ---------- Detection and measurement ---------- */
function detect(roi){
  if (!S.img) return message(TEXT.needImage);
  if (!roi) return message(TEXT.needRoi);
  if (!(S.scale > 0)) return message(TEXT.needScale);
  roi.params = params();
  const d = roi.params.diameter / S.scale;
  if (!(d >= 4)) return message(TEXT.tooSmallCell);
  message(''); hint(TEXT.detecting); viewer.classList.add('is-busy');
  setTimeout(() => {
    const rgba = new Uint8ClampedArray(roi.w * roi.h * 4), W = S.img.w;
    for (let y = 0; y < roi.h; y++) rgba.set(S.img.rgba.subarray(((y + roi.y0) * W + roi.x0) * 4, ((y + roi.y0) * W + roi.x0 + roi.w) * 4), y * roi.w * 4);
    const gray = toGray(rgba, roi.w, roi.h, $('channel').value, $('invert').checked);
    const {labels} = segment(gray, roi.mask, roi.w, roi.h, {diameter: d, split: roi.params.split, smooth: roi.params.smooth, faces: roi.params.faces});
    if (roi.labels) snapshot(roi);
    roi.labels = labels; roi.manual = {};
    let max = 0; for (const v of labels) if (v > max) max = v;
    roi.next = max + 1;
    if (S.pick?.roi === roi) S.pick = null;
    viewer.classList.remove('is-busy');
    remeasure(roi);
    hint();
  }, 30);
}
// The analysed brightness (channel and inversion as chosen) of a region, for the corrections that
// follow the walls.
function roiGray(roi){
  const rgba = new Uint8ClampedArray(roi.w * roi.h * 4), W = S.img.w;
  for (let y = 0; y < roi.h; y++) rgba.set(S.img.rgba.subarray(((y + roi.y0) * W + roi.x0) * 4, ((y + roi.y0) * W + roi.x0 + roi.w) * 4), y * roi.w * 4);
  return toGray(rgba, roi.w, roi.h, $('channel').value, $('invert').checked);
}
const minPieceOf = roi => Math.max(20, (roi.params.diameter / S.scale * 0.2) ** 2);
function limits(p){
  const one = Math.PI * (p.diameter / 2) ** 2;
  return {minArea: Number.isFinite(p.minArea) ? p.minArea : 0.1 * one, maxArea: Number.isFinite(p.maxArea) ? p.maxArea : 8 * one, excludeEdge: p.excludeEdge};
}
function remeasure(roi, render = true){
  if (!roi.labels) return;
  roi.cells = measure(roi.labels, roi.mask, roi.w, roi.h, {scale: S.scale, x0: roi.x0, y0: roi.y0});
  classify(roi.cells, limits(roi.params), roi.manual);
  roi.byLabel = new Map(roi.cells.map(c => [c.label, c]));
  if (render) { refresh(); renderAll(); }
}
$('detect').addEventListener('click', () => detect(S.rois[S.sel]));
// The two sliders re-detect the selected region when released (detect keeps an undo snapshot).
['split', 'smooth'].forEach(id => $(id).addEventListener('change', () => { const r = S.rois[S.sel]; if (r?.labels) detect(r); }));
// Re-detect the selected region when the image channel changes.
['channel', 'invert'].forEach(id => $(id).addEventListener('change', () => { const r = S.rois[S.sel]; if (r?.labels) detect(r); }));

/* ---------- Scale ---------- */
function setScale(s){
  S.scale = s;
  try { localStorage.setItem('cellshape-scale', String(s)); } catch {}
  S.rois.forEach(r => remeasure(r, false));
  refresh(); renderAll();
}
$('scale').addEventListener('change', () => { const s = num('scale'); if (s > 0) { setScale(s); message(''); } });
function finishLine(){
  const [[x1, y1], [x2, y2]] = S.pts;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (S.tool === 'scale' && len > 0) {
    const um = num('bar');
    if (um > 0) { const s = um / len; $('scale').value = fmtSig(s); setScale(s); message(TEXT.scaleSet(len, um, s)); }
  }
  setTool(null);
}
function setTool(t){
  S.tool = S.tool === t ? null : t; S.pts = []; S.pick = null;
  ['scale', 'roi'].forEach(x => $('draw-' + x).classList.toggle('is-active', S.tool === x));
  hint(); redraw();
}
$('draw-scale').addEventListener('click', () => setTool('scale'));
$('draw-roi').addEventListener('click', () => setTool('roi'));
function closeRoi(){
  const pts = S.pts;
  // the region tool stays on, so the next region can be outlined straight away
  if (pts.length >= 3) { S.pts = []; addRoi(pts); hint(); redraw(); }
}
// A polygon is being drawn: a region (tool 'roi') or a cell outline (mode 'draw').
const drawingPolygon = () => S.tool === 'roi' || (!S.tool && mode() === 'draw');
function closePolygon(){
  if (S.tool === 'roi') return closeRoi();
  const pts = S.pts;
  if (pts.length < 3) return;
  S.pts = [];
  drawOutline(pts);
  redraw();
}
// The drawn outline becomes a new cell in the region that contains its first point.
function drawOutline(pts){
  const [px, py] = pts[0];
  const roi = S.rois.find(r => { const x = Math.floor(px - r.x0), y = Math.floor(py - r.y0); return x >= 0 && y >= 0 && x < r.w && y < r.h && r.mask[y * r.w + x]; });
  if (!roi) return message(TEXT.noDraw);
  const inside = polygonMask(pts, roi.x0, roi.y0, roi.w, roi.h);
  if (!inside.some((v, i) => v && roi.mask[i])) return message(TEXT.noDraw);
  if (!roi.labels) roi.labels = new Int32Array(roi.w * roi.h);
  snapshot(roi);
  const L = roi.next;
  roi.next = drawCell(roi.labels, roi.mask, roi.w, roi.h, inside, L, Math.max(20, (roi.params.diameter / S.scale * 0.2) ** 2));
  delete roi.manual[L];
  message('');
  remeasure(roi);
}

/* ---------- Corrections ---------- */
const mode = () => document.querySelector('input[name=cs-mode]:checked').value;
document.querySelectorAll('input[name=cs-mode]').forEach(el => el.addEventListener('change', () => { S.pts = []; S.pick = null; hint(); redraw(); }));
// choosing a correction (even the one already chosen) ends drawing regions or lines, so clicks reach the plants
document.querySelectorAll('input[name=cs-mode]').forEach(el => el.addEventListener('click', () => { if (S.tool) setTool(S.tool); }));
function snapshot(roi){
  history.push({roi, labels: roi.labels.slice(), manual: {...roi.manual}, next: roi.next});
  if (history.length > 20) history.shift();
  $('undo').disabled = false;
}
function undo(){
  const h = history.pop();
  $('undo').disabled = !history.length;
  if (!h) return message(TEXT.nothingToUndo);
  Object.assign(h.roi, {labels: h.labels, manual: h.manual, next: h.next});
  S.pick = null;
  remeasure(h.roi);
}
$('undo').addEventListener('click', undo);
// Esc abandons what is under way: a line or outline being drawn, the first cell picked for joining, or
// the scale or region tool.
const busy = () => !!(S.tool || S.pts.length || (S.pick && mode() === 'merge'));
function cancelAction(){
  // Esc drops the points being placed; with none, it ends the tool (the region tool stays on between regions)
  const placing = S.pts.length > 0;
  S.pts = [];
  if (S.pick && mode() === 'merge') S.pick = null;
  if (S.tool && !placing) setTool(S.tool); else { hint(); redraw(); }
  message('');
}


function cellAt(ix, iy){
  const order = [S.sel, ...S.rois.map((_, i) => i).reverse().filter(i => i !== S.sel)];
  for (const i of order) {
    const r = S.rois[i];
    if (!r?.labels) continue;
    const x = Math.floor(ix - r.x0), y = Math.floor(iy - r.y0);
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
    const L = r.labels[y * r.w + x];
    if (L) return {i, roi: r, label: L};
  }
  return null;
}
function click(ix, iy, sx, sy){
  if (!S.img) return;
  if (S.tool === 'scale') {
    S.pts.push([ix, iy]);
    if (S.pts.length === 2) finishLine();
    return redraw();
  }
  if (S.tool === 'roi') {
    const p = [Math.max(0, Math.min(S.img.w, ix)), Math.max(0, Math.min(S.img.h, iy))];
    const [fx, fy] = S.pts.length ? toScreen(...S.pts[0]) : [Infinity, Infinity];
    if (S.pts.length >= 3 && Math.hypot(fx - sx, fy - sy) < 10) closeRoi(); else S.pts.push(p);
    return redraw();
  }
  const m = mode();
  if (m === 'draw') {
    const [fx, fy] = S.pts.length ? toScreen(...S.pts[0]) : [Infinity, Infinity];
    if (S.pts.length >= 3 && Math.hypot(fx - sx, fy - sy) < 10) closePolygon(); else S.pts.push([ix, iy]);
    return redraw();
  }
  if (m === 'split') {
    S.pts.push([ix, iy]);
    if (S.pts.length === 2) cut();
    return redraw();
  }
  const hit = cellAt(ix, iy);
  if (!hit) { S.pick = null; showInfo(); return redraw(); }
  if (hit.i !== S.sel) select(hit.i);
  const {roi, label: L} = hit, cell = roi.byLabel.get(L);
  if (m === 'info') { S.pick = {roi, label: L}; showInfo(roi, cell); return redraw(); }
  if (m === 'exclude' || m === 'space') {
    snapshot(roi);
    if (m === 'exclude') roi.manual[L] = cell.status === 'ok' ? 'excluded' : 'ok';
    else if (cell.status === 'space') delete roi.manual[L]; else roi.manual[L] = 'space';
    return remeasure(roi);
  }
  if (m === 'auto') {
    const d = roi.params.diameter / S.scale, gray = roiGray(roi);
    const before = {labels: roi.labels.slice(), manual: {...roi.manual}, next: roi.next};
    // a clear wall first; if there is none, a fainter one
    let created = [];
    for (const strength of [0.3, 0.2]) { created = autoSplit(roi.labels, gray, roi.w, roi.h, L, d, roi.next, minPieceOf(roi), strength); if (created.length) break; }
    if (!created.length) { message(TEXT.noAuto); return; }
    history.push({roi, ...before}); $('undo').disabled = false;
    roi.next += created.length;
    message('');
    return remeasure(roi);
  }
  if (m === 'merge') {
    if (!S.pick || S.pick.roi !== roi) { S.pick = {roi, label: L}; hint(TEXT.hints.mergeSecond); return redraw(); }
    if (S.pick.label === L) { S.pick = null; hint(); return redraw(); }
    if (!areAdjacent(roi.labels, roi.w, roi.h, S.pick.label, L)) { message(TEXT.notAdjacent); return; }
    snapshot(roi);
    mergeCells(roi.labels, S.pick.label, L);
    delete roi.manual[L];
    S.pick = null; message(''); hint();
    remeasure(roi);
  }
}
function cut(){
  const [[x1, y1], [x2, y2]] = S.pts;
  S.pts = [];
  // only the cell under the middle of the line is cut, so the ends may overshoot into its neighbours
  const mid = cellAt((x1 + x2) / 2, (y1 + y2) / 2);
  if (!mid) { message(TEXT.noSplit); return; }
  const roi = mid.roi;
  const before = {labels: roi.labels.slice(), manual: {...roi.manual}, next: roi.next};
  // the cut follows the brightest wall within a tenth of a cell diameter of the line
  const band = Math.max(3, 0.1 * roi.params.diameter / S.scale);
  const created = splitCells(roi.labels, roi.w, roi.h, x1 - roi.x0, y1 - roi.y0, x2 - roi.x0, y2 - roi.y0, roi.next, minPieceOf(roi), mid.label, roiGray(roi), band);
  if (!created.length) { message(TEXT.noSplit); return; }
  history.push({roi, ...before}); $('undo').disabled = false;
  roi.next += created.length;
  message('');
  remeasure(roi);
}

/* ---------- Pointer and keyboard ---------- */
let drag = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  drag = {x: e.offsetX, y: e.offsetY, ox: S.view.ox, oy: S.view.oy, moved: false, button: e.button};
});
canvas.addEventListener('pointermove', e => {
  S.hover = toImage(e.offsetX, e.offsetY);
  if (drag) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) { S.view.ox = drag.ox + dx; S.view.oy = drag.oy + dy; S.view.touched = true; canvas.classList.add('is-panning'); }
  }
  if (drag?.moved || S.pts.length) redraw();
});
canvas.addEventListener('pointerup', e => {
  if (drag && !drag.moved && drag.button === 0) click(...toImage(e.offsetX, e.offsetY), e.offsetX, e.offsetY);
  drag = null; canvas.classList.remove('is-panning');
});
canvas.addEventListener('pointerleave', () => { S.hover = null; if (S.pts.length) redraw(); });
canvas.addEventListener('dblclick', e => {
  if (!drawingPolygon()) return;
  e.preventDefault();
  // the two clicks of a double-click each placed a point; keep one
  const n = S.pts.length;
  if (n >= 2) { const [a, b] = [toScreen(...S.pts[n - 2]), toScreen(...S.pts[n - 1])]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 6) S.pts.pop(); }
  // a double-click on the first point: the first click closed the polygon, the second started the next one
  if (S.pts.length < 3) { S.pts = []; return redraw(); }
  closePolygon();
});
// Zoom only with ⌘/Ctrl/Alt held or a trackpad pinch (sent as Ctrl + wheel), so that plain scrolling
// still moves the page past the viewer.
const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
let wheelTimer = 0;
canvas.addEventListener('wheel', e => {
  if (!S.img) return;
  if (!(e.ctrlKey || e.metaKey || e.altKey)) {
    const tip = $('wheel');
    tip.textContent = TEXT.wheel(MOD_KEY); tip.hidden = false;
    clearTimeout(wheelTimer); wheelTimer = setTimeout(() => { tip.hidden = true; }, 1200);
    return;
  }
  e.preventDefault();
  zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? 0.01 : 0.0015)));
}, {passive: false});
$('zoom-in').addEventListener('click', () => zoomAt(canvas.width / dpr / 2, canvas.height / dpr / 2, 1.5));
$('zoom-out').addEventListener('click', () => zoomAt(canvas.width / dpr / 2, canvas.height / dpr / 2, 1 / 1.5));
$('fit').addEventListener('click', fit);
window.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { if (history.length) { e.preventDefault(); undo(); } return; }
  if (!busy()) return;
  if (e.key === 'Escape') cancelAction();
  else if (e.key === 'Enter' && drawingPolygon()) closePolygon();
  else if (e.key === 'Backspace' && S.pts.length) { e.preventDefault(); S.pts.pop(); redraw(); }
});
['color', 'show-fill', 'show-line'].forEach(id => $(id).addEventListener('change', renderAll));
$('show-number').addEventListener('change', redraw);

/* ---------- Messages, info and results ---------- */
function message(text){ $('message').textContent = text || ''; }
function hint(text){
  $('hint').textContent = text ?? (S.img ? TEXT.hints[S.tool || mode()] : '');
}
function showInfo(roi, c){
  const box = $('info');
  if (!c) { box.hidden = true; return; }
  const items = [[TEXT.cols.cell, c.label], [TEXT.cols.status, TEXT.status[c.status]], ...MEASURES.map(m => [mLabel(m), fmt(c[m.key], m.d)]), [TEXT.cols.angle, fmt(c.angle, 1)]];
  box.innerHTML = `<p class="cs-info-head">${esc(roiLabel(roi))}</p><dl>` +
    items.map(([name, v]) => `<div><dt>${esc(name)}</dt><dd>${esc(v)}</dd></div>`).join('') + '</dl>';
  box.hidden = false;
}
const meanSd = (s, d) => Number.isFinite(s.mean) ? `${s.mean.toFixed(d)} ± ${Number.isFinite(s.sd) ? s.sd.toFixed(d) : '—'}` : '—';
const EMPTY_TABLE = $('table').innerHTML;
const summaries = () => S.rois.filter(r => r.labels).map(r => ({r, s: summarise(r.cells, r.area * S.scale * S.scale, r.params.frame)}));
// The first columns of the region results; the measures follow (mean ± SD on screen; mean, SD and
// median in the CSV file and the copied table).
const regionBasics = ({r, s}) => [
  [TEXT.cols.region, r.id], [TEXT.cols.name, r.name.trim()], [TEXT.cols.count, s.count, r.params.frame === 'part' ? 1 : null],
  [TEXT.cols.whole, s.whole], [TEXT.cols.cut, s.cut], [TEXT.cols.measured, s.measured],
  [TEXT.cols.density, s.density, 1], [TEXT.cols.space, s.spaceFraction * 100, 2], [TEXT.cols.tissueArea, s.tissueArea, 0], [TEXT.cols.roiArea, s.roiArea, 0],
];
function refresh(){
  renderRoiList();
  hint();
  const rows = summaries();
  ['copy', 'csv-cells', 'png'].forEach(id => { $(id).disabled = !rows.length; });
  $('undo').disabled = !history.length;
  if (!rows.length) { $('table').innerHTML = EMPTY_TABLE; return; }
  const head = [...regionBasics(rows[0]).map(c => c[0]), ...MEASURES.map(mLabel)];
  $('table').innerHTML = `<table><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(row => {
      const basics = regionBasics(row).map(([, v, d], i) => i === 0 ? `<th scope="row">${esc(v)}</th>` : i === 1 ? `<td class="cs-left">${esc(v)}</td>` : `<td>${d == null ? v : fmt(v, d)}</td>`);
      return `<tr>${basics.join('')}${MEASURES.map(m => `<td>${meanSd(row.s[m.key], m.d)}</td>`).join('')}</tr>`;
    }).join('') + '</tbody></table>';
}

/* ---------- Saving and copying ---------- */
function download(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function copyText(text, button){
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  const original = button.textContent;
  button.textContent = TEXT.copied;
  setTimeout(() => { button.textContent = original; }, 1500);
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const baseName = () => (S.img?.name || 'image').replace(/\.[^.]+$/, '');
const csvNum = (v, d) => Number.isFinite(v) ? Number(v.toFixed(d)) : '';
// The settings a region was detected with, so that copied results and saved files record how they were made.
const settingsHead = () => [TEXT.cols.frame, TEXT.cols.pixel, TEXT.cols.diameter, TEXT.cols.split, TEXT.cols.smooth, TEXT.cols.faces, TEXT.cols.minArea, TEXT.cols.maxArea, TEXT.cols.edge, TEXT.cols.version, TEXT.cols.date];
function settingsCols(r){
  const lim = limits(r.params), yn = v => v ? TEXT.yes : TEXT.no;
  return [TEXT.frames[r.params.frame || 'tissue'], fmtSig(S.scale), r.params.diameter, r.params.split, r.params.smooth, yn(r.params.faces), csvNum(lim.minArea, 1), csvNum(lim.maxArea, 1), yn(lim.excludeEdge), VERSION, today()];
}
// Region results as rows of cells for the copied table (same columns as the table on screen, with each
// measure split into mean, SD and median, followed by the settings used).
function regionRows(){
  const rows = summaries();
  const head = [TEXT.cols.image, ...regionBasics(rows[0]).map(c => c[0])];
  MEASURES.forEach(m => head.push(...['mean', 'sd', 'median'].map(k => `${mLabel(m)} ${TEXT.stat[k]}`)));
  head.push(...settingsHead());
  return [head, ...rows.map(row => {
    const {r, s} = row;
    const out = [S.img.name, ...regionBasics(row).map(([, v, d]) => d == null ? v : csvNum(v, d))];
    MEASURES.forEach(m => out.push(...['mean', 'sd', 'median'].map(k => csvNum(s[m.key][k], m.d + 2))));
    out.push(...settingsCols(r));
    return out;
  })];
}

// Every cell, with the settings of its region (the region summary is in the copied results).
$('csv-cells').addEventListener('click', () => {
  const rows = [[TEXT.cols.image, TEXT.cols.region, TEXT.cols.name, TEXT.cols.cell, TEXT.cols.status, ...MEASURES.map(mLabel), TEXT.cols.angle, TEXT.cols.feretAngle, TEXT.cols.x, TEXT.cols.y, ...settingsHead()]];
  S.rois.forEach(r => { const set = settingsCols(r); r.cells.forEach(c => rows.push([S.img.name, r.id, r.name.trim(), c.label, TEXT.status[c.status], ...MEASURES.map(m => csvNum(c[m.key], m.d + 2)), csvNum(c.angle, 2), csvNum(c.feretAngle, 2), csvNum(c.x, 2), csvNum(c.y, 2), ...set])); });
  download(new Blob([csv(rows)], {type: 'text/csv'}), `${baseName()}_cells.csv`);
});
$('copy').addEventListener('click', e => {
  const lines = regionRows().map(r => r.join('\t'));
  lines.push('', TEXT.footer(VERSION, root.dataset.url, today(), S.img.name, S.scale));
  copyText(lines.join('\n'), e.currentTarget);
});
$('png').addEventListener('click', () => {
  const c = document.createElement('canvas');
  c.width = S.img.w; c.height = S.img.h;
  const g = c.getContext('2d');
  g.drawImage(S.img.canvas, 0, 0);
  S.rois.forEach(r => { if (r.overlay) g.drawImage(r.overlay, r.x0, r.y0); });
  drawVectors(g, (x, y) => [x, y], Math.max(1, S.img.w / 1200));
  c.toBlob(b => download(b, `${baseName()}_cells.png`), 'image/png');
});

document.querySelectorAll('[data-today]').forEach(el => { el.textContent = today(); });
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => {
  copyText(document.getElementById(button.dataset.copy).textContent.trim(), button);
}));
hint();
