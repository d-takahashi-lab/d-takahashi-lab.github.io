// Browser side of the Leaf Area tool: loads the photograph, lets the user draw regions and correct plants,
// and shows, saves and copies the results. All image analysis lives in leafarea.js.
// The viewer (zoom, pan, drawing) follows the Cell Shape tool. The page language comes from <html lang>.
import {decodeTiff, isTiff} from './tiff.js';
import {exifDate, hoursBetween} from './exif.js';
import {polygonMask, mergeCells} from './cellshape.js';
import {VERSION, whiteReference, greenIndex, brightness, autoThreshold, detectPlants, measurePlants, classify, summarise, splitPlant, plantOnLine, addArea, eraseArea, circleMask, matchPlants} from './leafarea.js';

const root = document.getElementById('la');
const en = document.documentElement.lang === 'en';
const $ = id => document.getElementById('la-' + id);

const ROI_COLORS = ['#2B6684', '#9A4A8C', '#B07D12', '#5E8B2A', '#626262', '#A3472E'];
const TEXT = en ? {
  status: {ok: 'Measured', edge: 'Touches the region edge', excluded: 'Left out by hand'},
  imageInfo: (name, w, h) => `${name} — ${w} × ${h} px`,
  cannotRead: 'This image could not be read. Please use JPEG, PNG or TIFF.',
  loading: 'Loading the image…',
  scaledTiff: bits => `This is a ${bits}-bit image: brightness was scaled to 8 bits for display and analysis (0.05–99.95th percentile).`,
  tiffErrors: {bigtiff: 'BigTIFF files cannot be read. Save the image as an ordinary TIFF, PNG or JPEG.', compression: 'This TIFF uses a compression that cannot be read here (e.g. JPEG). Save it uncompressed, with LZW, or as PNG or JPEG.', bits: 'Only 8-, 16- and 32-bit TIFF images can be read.'},
  exampleLoaded: 'Example image loaded: Arabidopsis rosettes on agar plates, photographed from above. Trace the diameter of a plate (step 2), then outline a plate (step 3).',
  reuse: n => `Use the same ${n} region${n === 1 ? '' : 's'} and scale for this image? Plants keep their numbers when they are in about the same place (Cancel discards the regions).`,
  reused: n => `The ${n} region${n === 1 ? '' : 's'} of the previous image were analysed again. Check the plants and their numbers.`,
  needImage: 'Choose an image first.',
  needScale: 'Set the scale first (step 2): trace a known length or type the pixel size.',
  needRoi: 'Outline a region first (step 3).',
  tooSmallRoi: 'The region is too small.',
  scaleSet: (px, mm, s) => `${px.toFixed(1)} px = ${mm} mm → ${fmtSig(s)} mm per pixel`,
  scaleSaved: 'Using the pixel size from your last session in this browser. Check it matches this image.',
  noPlant: 'There is no plant there. Click on a plant’s leaves.',
  noSplit: 'The line did not divide a plant into two. Draw it between the two plants, across the place where they touch.',
  noPaint: 'Draw the outline inside a region.',
  nothingToUndo: 'Nothing to undo.',
  deleteRoi: n => `Delete region ${n}?`,
  roiName: n => `Name of region ${n}`,
  roiItem: (n, plants) => `${n}${plants == null ? '' : ` — ${plants} plant${plants === 1 ? '' : 's'}`}`,
  remove: 'Delete',
  wheel: key => `Hold ${key} and scroll to zoom`,
  autoValue: v => `Automatic: ${v.toFixed(2)}`,
  hints: {
    none: '',
    scale: 'Click the two ends of the known length (for example across a plate or along a ruler).',
    roi: 'Click to place corners; click the first point, double-click or press Enter to close. Then outline the next region. Esc cancels the outline being drawn; press Esc again, the button, or choose a correction to finish.',
    circle: 'Click the centre of the circle, then a point on its edge. Then draw the next region. Esc, the button, or choosing a correction finishes.',
    info: 'Click a plant to see its values. Drag to move; ⌘ (Ctrl) + scroll to zoom.',
    exclude: 'Click a plant to leave it out of the measurements; click again to include it.',
    merge: 'Click the two plants to join, one after the other.',
    mergeSecond: 'Now click the plant to join to it.',
    split: 'Click two points on a line between the two plants. The plant the line crosses is cut along it.',
    add: 'Click around the area to add; click the first point, double-click or press Enter to finish. It joins the plant it overlaps most.',
    erase: 'Click around the area to remove from the plants; click the first point, double-click or press Enter to finish.',
  },
  copied: 'Copied',
  batch: {
    needSetup: 'First set up the analysis on one image of the series: the scale (step 2) and the regions (step 3).',
    noImages: 'No images (JPEG, PNG or TIFF) were found.',
    run: n => `Analyse all ${n} images in the folder`,
    folderInfo: (folder, n) => ` — 1 of ${n} images in “${folder}”`,
    folderLoaded: n => `The first of the ${n} images is open (in the order taken, or by file name when some have no date). Set the scale and regions on it, check the plants, then analyse them all in step 6.`,
    progress: (i, n, name) => `Analysing ${i} of ${n}: ${name}`,
    done: (n, skipped) => `${n} image${n === 1 ? '' : 's'} analysed.${skipped ? ` ${skipped} skipped:` : ''}`,
    cancelled: (n) => `Stopped after ${n} image${n === 1 ? '' : 's'}.`,
    otherSize: (w, h, W, H) => `Skipped: ${w} × ${h} px, with other proportions than the image the regions were drawn on (${W} × ${H} px)`,
    resized: (w, h) => `${w} × ${h} px: regions and pixel size scaled to this size`,
    unreadable: 'Skipped: could not be read',
    view: (i, n, name, taken) => `${i} / ${n}　${name}${taken ? `　${taken}` : ''}`,
    open: 'Open this image to check or correct it',
    edited: 'Corrected by hand',
    footer: (v, url, date, n, scale) => `Analysed with Leaf Area Analyzer version ${v} (${url}) on ${date}: ${n} images; pixel size ${fmtSig(scale)} mm.`,
  },
  growth: {
    x: {h: 'Elapsed time (h)', d: 'Elapsed time (days)', n: 'Image'},
    empty: 'No measured plants yet.',
    fileTimes: n => `${n} image${n === 1 ? ' has' : 's have'} no date taken (EXIF); the time the file was last changed is used instead.`,
    noTimes: 'Some images have no date, so they are shown in order.',
    hint: 'Click the graph to show that image above. The dashed line marks the image shown.',
  },
  cols: {image: 'Image', taken: 'Date taken', hours: 'Elapsed time (h)', note: 'Note', region: 'Region', name: 'Name', plant: 'Plant', status: 'Status', count: 'Plants', total: 'Total area (mm²)', left: 'Left out', x: 'Centroid x (mm)', y: 'Centroid y (mm)', pixel: 'Pixel size (mm)', threshold: 'Greenness threshold', auto: 'Automatic threshold', dark: 'Darker parts included (fraction of background brightness)', gap: 'Joining distance (mm)', minArea: 'Minimum area (mm²)', edge: 'Plants at the edge left out', white: 'White reference (R, G, B)', version: 'Tool version', date: 'Date analysed'},
  stat: {mean: 'mean', sd: 'SD', median: 'median'},
  yes: 'yes', no: 'no',
  footer: (v, url, date, image, scale) => `Analysed with Leaf Area Analyzer version ${v} (${url}) on ${date}. Image: ${image}; pixel size ${fmtSig(scale)} mm.`,
} : {
  status: {ok: '計測', edge: '領域の縁にかかる', excluded: '手で除外'},
  imageInfo: (name, w, h) => `${name}（${w} × ${h} ピクセル）`,
  cannotRead: 'この画像は読み込めません。JPEG・PNG・TIFFのいずれかを使ってください。',
  loading: '画像を読み込んでいます…',
  scaledTiff: bits => `${bits}ビットの画像なので、明るさを8ビットに変換して表示・解析します（0.05〜99.95パーセンタイルの範囲）。`,
  tiffErrors: {bigtiff: 'BigTIFF形式は読み込めません。通常のTIFF・PNG・JPEGで保存し直してください。', compression: 'このTIFFの圧縮形式（JPEG圧縮など）は読み込めません。無圧縮・LZW圧縮のTIFFか、PNG・JPEGで保存し直してください。', bits: '8・16・32ビットのTIFFだけが読み込めます。'},
  exampleLoaded: '例の画像（寒天培地で育てたシロイヌナズナのロゼットを上から撮影）を読み込みました。手順2でシャーレの直径をなぞってスケールを決め、手順3でシャーレを囲んでみてください。',
  reuse: n => `前の画像の領域（${n}個）とスケールを、この画像でも使いますか？ ほぼ同じ位置にある株は同じ番号を引き継ぎます（キャンセルすると領域を消します）。`,
  reused: n => `前の画像の領域（${n}個）で解析し直しました。株と番号を確かめてください。`,
  needImage: '先に画像を選んでください。',
  needScale: '先にスケールを決めてください（手順2）。長さの分かるものをなぞるか、1ピクセルの長さを入力します。',
  needRoi: '先に領域を囲んでください（手順3）。',
  tooSmallRoi: '領域が小さすぎます。',
  scaleSet: (px, mm, s) => `${px.toFixed(1)}ピクセル = ${mm} mm → 1ピクセル ${fmtSig(s)} mm`,
  scaleSaved: 'このブラウザで前回使った値を入れています。この画像に合っているか確かめてください。',
  noPlant: 'そこには株がありません。株の葉をクリックしてください。',
  noSplit: '線で株が2つに分かれませんでした。2つの株の間に、くっついている所を横切るように線を引いてください。',
  noPaint: '輪郭は領域の中に描いてください。',
  nothingToUndo: '元に戻す操作はありません。',
  deleteRoi: n => `領域「${n}」を削除しますか？`,
  roiName: n => `領域${n}の名前`,
  roiItem: (n, plants) => `${n}${plants == null ? '' : `（${plants}株）`}`,
  remove: '削除',
  wheel: key => `${key}キーを押しながらスクロールすると拡大・縮小します`,
  autoValue: v => `自動：${v.toFixed(2)}`,
  hints: {
    none: '',
    scale: '長さの分かるもの（シャーレの直径や定規など）の両端をクリックしてください。',
    roi: 'クリックで角を置き、最初の点のクリック・ダブルクリック・Enterキーで閉じます。続けて次の領域を囲めます。Escキーで描きかけを取り消し、もう一度Escキーかボタンを押すか、手直しの種類を選ぶと終わります。',
    circle: '円の中心をクリックし、次に円周上の1点をクリックしてください。続けて次の領域を描けます。Escキーかボタンを押すか、手直しの種類を選ぶと終わります。',
    info: '株をクリックすると値を表示します。ドラッグで移動、⌘（Ctrl）キー＋スクロールで拡大・縮小します。',
    exclude: 'クリックした株を計測から外します。もう一度クリックすると戻します。',
    merge: 'つなぐ2つの株を順にクリックしてください。',
    mergeSecond: 'つなぐもう1つの株をクリックしてください。',
    split: '2つの株の間に線を引くように、2点をクリックしてください。線が横切る株を、その線で切り分けます。',
    add: '足す範囲をクリックで囲み、最初の点のクリック・ダブルクリック・Enterキーで閉じます。いちばん重なる株に加わります。',
    erase: '株から消す範囲をクリックで囲み、最初の点のクリック・ダブルクリック・Enterキーで閉じます。',
  },
  copied: 'コピーしました',
  batch: {
    needSetup: '先に、シリーズの1枚でスケール（手順2）と領域（手順3）を決めてください。',
    noImages: '画像（JPEG・PNG・TIFF）が見つかりませんでした。',
    run: n => `フォルダの画像${n}枚をすべて解析`,
    folderInfo: (folder, n) => `　フォルダ「${folder}」の${n}枚の1枚目`,
    folderLoaded: n => `${n}枚のうち最初の画像（撮影日時の順、日時のない画像があればファイル名の順）を開きました。この画像でスケールと領域を決め、株を確かめてから、手順6で全部を解析します。`,
    progress: (i, n, name) => `${n}枚中${i}枚目を解析しています：${name}`,
    done: (n, skipped) => `${n}枚を解析しました。${skipped ? `${skipped}枚は飛ばしました：` : ''}`,
    cancelled: (n) => `${n}枚で止めました。`,
    otherSize: (w, h, W, H) => `飛ばした：${w} × ${h} ピクセルで、領域を描いた画像（${W} × ${H} ピクセル）と縦横の比が違う`,
    resized: (w, h) => `${w} × ${h} ピクセルなので、領域と1ピクセルの長さをこの大きさに合わせた`,
    unreadable: '飛ばした：読み込めない',
    view: (i, n, name, taken) => `${i} / ${n}　${name}${taken ? `　${taken}` : ''}`,
    open: 'この画像を開いて確かめる・手直しする',
    edited: '手直しあり',
    footer: (v, url, date, n, scale) => `Leaf Area Analyzer バージョン${v}（${url}）で${date}に解析。画像${n}枚、1ピクセル ${fmtSig(scale)} mm。`,
  },
  growth: {
    x: {h: '経過時間 (h)', d: '経過日数 (日)', n: '画像の番号'},
    empty: '計測した株がまだありません。',
    fileTimes: n => `${n}枚は撮影日時（EXIF）がないため、ファイルの更新日時を使っています。`,
    noTimes: '日時の分からない画像があるため、画像の順番で表示しています。',
    hint: 'グラフをクリックすると、その画像を上に表示します。点線は表示中の画像です。',
  },
  cols: {image: '画像', taken: '撮影日時', hours: '経過時間 (h)', note: '備考', region: '領域', name: '名前', plant: '番号', status: '状態', count: '株数', total: '面積の合計 (mm²)', left: '除外', x: '重心 x (mm)', y: '重心 y (mm)', pixel: '1ピクセルの長さ (mm)', threshold: '緑のしきい値', auto: '自動のしきい値', dark: '暗い部分も含める（背景の明るさに対する割合）', gap: 'まとめる距離 (mm)', minArea: '最小面積 (mm²)', edge: '縁の株を除外', white: '白の基準 (R, G, B)', version: 'ツールのバージョン', date: '解析日'},
  stat: {mean: '平均', sd: '標準偏差', median: '中央値'},
  yes: 'はい', no: 'いいえ',
  footer: (v, url, date, image, scale) => `Leaf Area Analyzer バージョン${v}（${url}）で${date}に解析。画像：${image}、1ピクセル ${fmtSig(scale)} mm。`,
};

// The measures, in the order used everywhere: the plant panel, the results table, both CSV files and the
// copied table all take their columns, names and units from this one list.
const MEASURES = [
  {key: 'area', ja: '面積', en: 'Area', unit: 'mm²', d: 2},
  {key: 'perimeter', ja: '周囲長', en: 'Perimeter', unit: 'mm', d: 1},
  {key: 'hullArea', ja: '凸包の面積', en: 'Convex hull area', unit: 'mm²', d: 2},
  {key: 'compactness', ja: '充実度', en: 'Compactness', d: 3},
  {key: 'diameter', ja: '直径', en: 'Diameter', unit: 'mm', d: 2},
  {key: 'width', ja: '最小幅', en: 'Minimum width', unit: 'mm', d: 2},
];
const mName = m => en ? m.en : m.ja;
const mLabel = m => m.unit ? `${mName(m)} (${m.unit})` : mName(m);
const FONT = 'Arial, Hiragino Kaku Gothic ProN, Yu Gothic, sans-serif';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function fmtSig(v){ return Number.isFinite(v) ? String(Number(v.toPrecision(4))) : '—'; }
const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '—';
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const num = id => { const v = parseFloat($(id).value); return Number.isFinite(v) && v > 0 ? v : NaN; };
const nonNeg = id => { const v = parseFloat($(id).value); return Number.isFinite(v) && v >= 0 ? v : NaN; };

/* ---------- State ---------- */
const S = {
  img: null,                 // {w, h, name, canvas, rgba, white}
  scale: NaN,                // mm per pixel
  rois: [], sel: -1, nextId: 1,
  tool: null,                // 'scale' | 'roi' | 'circle' while drawing
  pts: [],                   // points of the line or polygon being drawn (image coordinates)
  hover: null,
  pick: null,                // {roi, label}: plant shown in the info panel or first plant to join
  view: {k: 1, ox: 0, oy: 0, fit: 1},
};
let history = [];            // undo snapshots: {roi, labels, manual, next}

try { const s = parseFloat(localStorage.getItem('leafarea-scale')); if (s > 0) { S.scale = s; $('scale').value = fmtSig(s); } } catch {}

/* ---------- Canvas ---------- */
const canvas = $('canvas'), ctx = canvas.getContext('2d'), viewer = $('viewer');
let dpr = 1, raf = 0;
const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
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
  // the line, circle or polygon being drawn
  const m = mode();
  if (S.pts.length && (S.tool || m === 'split' || m === 'add' || m === 'erase')) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath();
    if (S.tool === 'circle') {
      const [cx, cy] = toScreen(...S.pts[0]);
      if (S.hover) { const [hx, hy] = toScreen(...S.hover); ctx.arc(cx, cy, Math.hypot(hx - cx, hy - cy), 0, 2 * Math.PI); }
    } else {
      S.pts.forEach((p, i) => { const [x, y] = toScreen(...p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      if (S.hover) ctx.lineTo(...toScreen(...S.hover));
    }
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3; ctx.stroke(); ctx.shadowBlur = 0;
    S.pts.forEach((p, i) => { const [x, y] = toScreen(...p); ctx.fillStyle = i ? '#ffffff' : '#ffd400'; ctx.fillRect(x - 3, y - 3, 6, 6); });
  }
}

// Region outlines and names, plant numbers, convex hulls and the picked plant, in the coordinates given
// by map (screen or image). rois are the regions of the open image, or those of a batch result.
function drawVectors(g, map, unit, W, H, rois = S.rois){
  const open = rois === S.rois;
  rois.forEach((r, i) => {
    const col = ROI_COLORS[(r.id - 1) % ROI_COLORS.length];
    g.beginPath();
    r.poly.forEach((p, j) => { const [x, y] = map(...p); j ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath();
    g.lineWidth = (open && i === S.sel ? 3 : 2) * unit; g.strokeStyle = '#ffffff'; g.setLineDash([]); g.stroke();
    g.lineWidth = (open && i === S.sel ? 2 : 1.2) * unit; g.strokeStyle = col; g.stroke();
    const [tx, ty] = map(...r.labelAt);
    g.font = `700 ${13 * unit}px ${FONT}`;
    const tw = g.measureText(r.name).width;
    g.fillStyle = col; g.fillRect(tx - tw / 2 - 5 * unit, ty - 20 * unit, tw + 10 * unit, 20 * unit);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText(r.name, tx, ty - 6 * unit); g.textAlign = 'start';
  });
  if ($('show-hull').checked) {
    g.setLineDash([5 * unit, 4 * unit]); g.lineWidth = 1.5 * unit;
    rois.forEach(r => r.plants.forEach(p => {
      if (p.status !== 'ok' || p.hull.length < 3) return;
      g.beginPath();
      p.hull.forEach((q, j) => { const [x, y] = map(...q); j ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
    }));
    g.setLineDash([]);
  }
  if ($('show-number').checked) {
    g.font = `700 ${14 * unit}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    rois.forEach(r => r.plants.forEach(p => {
      const [x, y] = map(p.x / S.scale, p.y / S.scale);
      if (W && (x < 0 || y < 0 || x > W || y > H)) return;
      g.lineWidth = 3.5 * unit; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(String(p.label), x, y);
      g.fillStyle = '#ffffff'; g.fillText(String(p.label), x, y);
    }));
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }
  const p = open && pickedPlant();
  if (p && unit === 1) {
    g.lineWidth = 3; g.strokeStyle = '#ffd400';
    p.outlines.forEach(o => {
      g.beginPath();
      o.forEach((q, j) => { const [x, y] = map(...q); j ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath(); g.stroke();
    });
  }
}
const pickedPlant = () => S.pick && S.rois.includes(S.pick.roi) ? S.pick.roi.byLabel?.get(S.pick.label) : null;

/* ---------- Overlay colours ---------- */
function hsl(h, s, l){
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
function renderAll(){
  S.rois.forEach(renderOverlay);
  redraw();
}
function renderOverlay(r){
  if (!r.labels) { r.overlay = null; return; }
  const {w, h, labels} = r, fill = $('show-fill').checked;
  const colors = new Map();
  for (const p of r.plants) {
    let rgb, a = 110, line = [255, 255, 255, 240];
    if (p.status !== 'ok') { rgb = [150, 150, 150]; a = 90; line = [200, 200, 200, 200]; }
    else rgb = hsl((p.label * 137.508 + 300) % 360, 0.85, 0.55);
    colors.set(p.label, {fill: [...rgb, fill ? a : 0], line});
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
    const c = edge ? col.line : col.fill;
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
  try { src = await createImageBitmap(file, {imageOrientation: 'from-image'}); }
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
// fromBatch: an entry of the batch results, opened with the same regions and its plant numbers.
async function loadFile(file, example, fromBatch){
  if (!file) return;
  // the regions of the previous image can be used again (a time series taken with a fixed camera)
  const keep = fromBatch ? S.rois.length > 0 : S.rois.length > 0 && !example && confirm(TEXT.reuse(S.rois.length));
  if (batch) { batch.opened = fromBatch ? batch.entries.indexOf(fromBatch) : -1; $('batch-update').disabled = true; }
  message(TEXT.loading);
  let im;
  try { im = await readImage(file); } catch (e) { message(e.message); return; }
  const before = S.img;
  S.img = {w: im.w, h: im.h, name: file.name, canvas: im.canvas, rgba: im.rgba, white: whiteReference(im.rgba, im.w, im.h)};
  S.tool = null; S.pts = []; S.pick = null; history = [];
  if (keep) {
    // the same photograph at another size: the regions and the scale follow it
    const f = before ? sizeFactor(im.w, im.h, before.w, before.h) : 1;
    if (f && f !== 1) {
      S.rois.forEach(r => { const geo = scaledGeometry(r, f, im.w, im.h); if (geo) Object.assign(r, geo); });
      S.scale /= f; $('scale').value = fmtSig(S.scale);
    }
    S.rois = S.rois.filter(r => r.x0 + r.w <= im.w && r.y0 + r.h <= im.h);
    S.rois.forEach(r => { r.previous = fromBatch ? fromBatch.regions.find(g => g.id === r.id)?.plants || [] : r.plants; r.labels = null; r.plants = []; r.byLabel = new Map(); r.overlay = null; });
    S.sel = Math.min(S.sel, S.rois.length - 1);
  } else { S.rois = []; S.sel = -1; S.nextId = 1; }
  $('drop').hidden = true;
  sizeViewer();
  $('image-info').textContent = TEXT.imageInfo(file.name, im.w, im.h);
  ['draw-scale', 'draw-roi', 'whole', 'detect'].forEach(id => { $(id).disabled = false; });
  $('modes').disabled = false;
  if (example) {
    $('bar').value = example.barMm;
    message(TEXT.exampleLoaded);
  } else message([im.note, S.scale > 0 && !keep ? TEXT.scaleSaved : ''].filter(Boolean).join('\n'));
  fit(); refresh();
  if (keep && S.rois.length) {
    S.rois.forEach(r => detect(r, false, false));
    S.rois.forEach(r => { delete r.previous; });
    message(TEXT.reused(S.rois.length));
    refresh(); renderAll();
  }
  if (fromBatch) $('batch-update').disabled = false;
}
$('example').addEventListener('click', async e => {
  const button = e.currentTarget;
  button.disabled = true;
  try {
    const res = await fetch(button.dataset.src);
    if (!res.ok) throw new Error();
    await loadFile(new File([await res.blob()], 'example-rosettes.webp', {type: 'image/webp'}), {barMm: +button.dataset.barMm});
  } catch { message(TEXT.cannotRead); }
  button.disabled = false;
});
$('file').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
viewer.addEventListener('dragover', e => { e.preventDefault(); viewer.classList.add('is-drag'); });
viewer.addEventListener('dragleave', () => viewer.classList.remove('is-drag'));
viewer.addEventListener('drop', e => { e.preventDefault(); viewer.classList.remove('is-drag'); loadFile(e.dataTransfer.files[0]); });

/* ---------- Regions ---------- */
function params(){
  // dark: plant parts darker than this fraction of the background brightness are included (0: off)
  return {auto: $('auto').checked, threshold: +$('threshold').value, dark: $('dark').checked ? +$('dark-level').value : 0, gap: nonNeg('gap'), minArea: nonNeg('min'), excludeEdge: $('edge').checked};
}
function setParams(p){
  $('auto').checked = p.auto; $('threshold').value = p.threshold; showThreshold(p);
  $('gap').value = Number.isFinite(p.gap) ? p.gap : ''; $('min').value = Number.isFinite(p.minArea) ? p.minArea : '';
  $('edge').checked = p.excludeEdge;
  $('dark').checked = p.dark > 0; if (p.dark > 0) $('dark-level').value = p.dark;
  showDark();
}
function showDark(){ $('dark-out').value = `${Math.round(+$('dark-level').value * 100)}%`; $('dark-level').disabled = !$('dark').checked; }
function showThreshold(p){
  $('threshold-out').value = (+p.threshold).toFixed(2);
  $('auto-out').textContent = Number.isFinite(p.autoValue) ? TEXT.autoValue(p.autoValue) : '';
}
// shape is {poly} for a polygon or {circle: [cx, cy, r]}; circles are drawn as 96-sided polygons.
// The pixels of a region drawn on an image of W × H pixels: {shape, poly, labelAt, x0, y0, w, h, mask, area},
// or null when too small.
function regionGeometry(shape, W, H){
  let poly = shape.poly;
  if (shape.circle) { const [cx, cy, r] = shape.circle; poly = Array.from({length: 96}, (_, k) => [cx + r * Math.cos(k * Math.PI / 48), cy + r * Math.sin(k * Math.PI / 48)]); }
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(W, Math.ceil(Math.max(...xs))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) return null;
  const mask = shape.circle ? circleMask(...shape.circle, x0, y0, w, h) : polygonMask(poly, x0, y0, w, h);
  let area = 0; for (const v of mask) area += v;
  if (area < 50) return null;
  // the name sits above the region's top point
  const top = poly.reduce((a, p) => p[1] < a[1] ? p : a, poly[0]);
  return {shape, poly, labelAt: [top[0], Math.max(22, top[1])], x0, y0, w, h, mask, area};
}
// The same region on an image f times as large (the same photograph saved at another size).
function scaledGeometry(r, f, W, H){
  const sh = r.shape.circle ? {circle: r.shape.circle.map(v => v * f)} : {poly: r.shape.poly.map(([x, y]) => [x * f, y * f])};
  return regionGeometry(sh, W, H);
}
// The factor between an image of w × h and one of W × H pixels when they have the same proportions, else 0.
function sizeFactor(w, h, W, H){
  const fx = w / W, fy = h / H;
  return Math.abs(fx - fy) <= 0.01 * fx ? fx : 0;
}
function addRoi(shape){
  const geo = regionGeometry(shape, S.img.w, S.img.h);
  if (!geo) { message(TEXT.tooSmallRoi); return; }
  const id = S.nextId++;
  const typed = $('name').value.trim();
  const roi = {id, name: typed || String(id), ...geo, labels: null, manual: {}, plants: [], byLabel: new Map(), next: 1, params: params()};
  $('name').value = nextName(typed);
  S.rois.push(roi); S.sel = S.rois.length - 1;
  refresh();
  detect(roi);
}
// The name for the next region: a trailing number goes up by one (WT-1 → WT-2); other names are cleared.
function nextName(name){
  const m = name.match(/^(.*?)(\d+)$/);
  return m ? m[1] + String(+m[2] + 1).padStart(m[2].length, '0') : '';
}
function select(i){
  S.sel = i;
  const r = S.rois[i];
  if (r) setParams(r.params);
  refresh();
}
function removeRoi(i){
  const r = S.rois[i];
  if (!confirm(TEXT.deleteRoi(r.name))) return;
  S.rois.splice(i, 1);
  history = history.filter(h => h.roi !== r);
  if (S.pick?.roi === r) S.pick = null;
  S.sel = Math.min(S.sel, S.rois.length - 1);
  refresh(); renderAll();
}
function renderRoiList(){
  const ul = $('rois');
  ul.innerHTML = S.rois.map((r, i) => `<li class="${i === S.sel ? 'is-selected' : ''}">
    <button type="button" class="cs-roi" data-i="${i}" aria-pressed="${i === S.sel}"><span class="cs-swatch" style="background:${ROI_COLORS[(r.id - 1) % ROI_COLORS.length]}"></span>${esc(TEXT.roiItem(r.id, r.labels ? summarise(r.plants).count : null))}</button>
    <input class="cs-roi-tissue la-roi-name" data-name="${i}" value="${esc(r.name)}" aria-label="${esc(TEXT.roiName(r.id))}"/>
    <button type="button" class="cs-remove" data-remove="${i}">${TEXT.remove}</button></li>`).join('');
}
$('rois').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.remove != null) removeRoi(+b.dataset.remove); else select(+b.dataset.i);
});
$('rois').addEventListener('change', e => {
  const i = e.target.dataset.name;
  if (i == null) return;
  S.rois[+i].name = e.target.value.trim() || String(S.rois[+i].id);
  refresh(); redraw();
});
// Settings belong to the selected region and take effect at once: the threshold, joining distance and
// minimum area detect the plants again, the edge rule only changes which plants are counted.
$('threshold').addEventListener('input', () => { $('auto').checked = false; showThreshold(params()); });
$('dark-level').addEventListener('input', showDark);
$('dark').addEventListener('input', showDark);
['auto', 'threshold', 'dark', 'dark-level', 'gap', 'min'].forEach(id => $(id).addEventListener('change', () => {
  const r = S.rois[S.sel];
  if (r?.labels) detect(r); else showThreshold(params());
}));
$('edge').addEventListener('change', () => {
  const r = S.rois[S.sel];
  if (!r) return;
  r.params = {...r.params, excludeEdge: $('edge').checked};
  if (r.labels) remeasure(r);
});

/* ---------- Detection and measurement ---------- */
// Detects the plants of a region, with the settings on the form (the selected region) or with the region's
// own settings (fromForm false: other regions after a new scale or image). Plants are numbered by position:
// after a new image, each takes the number of the nearest plant of the previous image (roi.previous).
function detect(roi, render = true, fromForm = true){
  if (!S.img) return message(TEXT.needImage);
  if (!roi) return message(TEXT.needRoi);
  if (!(S.scale > 0)) return message(TEXT.needScale);
  const p = roi.params = fromForm ? {...params(), autoValue: roi.params.autoValue} : {...roi.params};
  const rgba = new Uint8ClampedArray(roi.w * roi.h * 4), W = S.img.w;
  for (let y = 0; y < roi.h; y++) rgba.set(S.img.rgba.subarray(((y + roi.y0) * W + roi.x0) * 4, ((y + roi.y0) * W + roi.x0 + roi.w) * 4), y * roi.w * 4);
  const index = greenIndex(rgba, roi.w, roi.h, S.img.white);
  p.autoValue = autoThreshold(index, roi.mask);
  if (p.auto) p.threshold = Math.round(p.autoValue * 100) / 100;
  const s2 = S.scale * S.scale;
  const bright = p.dark > 0 ? brightness(rgba, roi.w, roi.h, S.img.white) : null;
  const {labels} = detectPlants(index, roi.mask, roi.w, roi.h, {threshold: p.threshold, minPx: (Number.isFinite(p.minArea) ? p.minArea : 0) / s2, gapPx: (Number.isFinite(p.gap) ? p.gap : 0) / S.scale, bright, darkLevel: p.dark});
  if (roi.labels) snapshot(roi);
  roi.labels = labels; roi.manual = {};
  // follow the numbering of the previous image
  if (roi.previous?.length) {
    const fresh = measurePlants(labels, roi.mask, roi.w, roi.h, {scale: S.scale, x0: roi.x0, y0: roi.y0});
    const map = matchPlants(roi.previous, fresh, Math.max(...roi.previous.map(q => q.diameter), 1));
    for (let i = 0; i < labels.length; i++) if (labels[i]) labels[i] = map.get(labels[i]);
    for (const q of roi.previous) if (q.status === 'excluded' && [...map.values()].includes(q.label)) roi.manual[q.label] = 'excluded';
  }
  let max = 0; for (const v of labels) if (v > max) max = v;
  roi.next = max + 1;
  if (S.pick?.roi === roi) S.pick = null;
  if (S.rois[S.sel] === roi) setParams(p);
  remeasure(roi, render);
}
function remeasure(roi, render = true){
  if (!roi.labels) return;
  roi.plants = measurePlants(roi.labels, roi.mask, roi.w, roi.h, {scale: S.scale, x0: roi.x0, y0: roi.y0});
  classify(roi.plants, {excludeEdge: roi.params.excludeEdge}, roi.manual);
  roi.byLabel = new Map(roi.plants.map(p => [p.label, p]));
  if (render) { refresh(); renderAll(); }
}
$('detect').addEventListener('click', () => detect(S.rois[S.sel]));

/* ---------- Scale ---------- */
function setScale(s){
  S.scale = s;
  try { localStorage.setItem('leafarea-scale', String(s)); } catch {}
  // areas and lengths follow the new scale; the joining distance and minimum area are in mm, so detect again
  S.rois.forEach(r => { if (r.labels) detect(r, false, false); });
  refresh(); renderAll();
}
$('scale').addEventListener('change', () => { const s = num('scale'); if (s > 0) { setScale(s); message(''); } });
function finishLine(){
  const [[x1, y1], [x2, y2]] = S.pts;
  const len = Math.hypot(x2 - x1, y2 - y1), mm = num('bar');
  setTool(null);
  if (len > 0 && mm > 0) { const s = mm / len; $('scale').value = fmtSig(s); setScale(s); message(TEXT.scaleSet(len, mm, s)); }
}
function setTool(t){
  S.tool = S.tool === t ? null : t; S.pts = []; S.pick = null;
  $('draw-scale').classList.toggle('is-active', S.tool === 'scale');
  $('draw-roi').classList.toggle('is-active', S.tool === 'roi' || S.tool === 'circle');
  hint(); redraw();
}
$('draw-scale').addEventListener('click', () => setTool('scale'));
$('draw-roi').addEventListener('click', () => setTool(document.querySelector('input[name=la-shape]:checked').value));
document.querySelectorAll('input[name=la-shape]').forEach(el => el.addEventListener('change', () => { if (S.tool === 'roi' || S.tool === 'circle') { S.tool = null; setTool(el.value); } }));
$('whole').addEventListener('click', () => { setTool(null); addRoi({poly: [[0, 0], [S.img.w, 0], [S.img.w, S.img.h], [0, S.img.h]]}); });

// A polygon is being drawn: a region (tool 'roi') or an area to add or erase.
const drawingPolygon = () => S.tool === 'roi' || (!S.tool && (mode() === 'add' || mode() === 'erase'));
function closePolygon(){
  const pts = S.pts;
  if (pts.length < 3) return;
  // the region tool stays on, so the next region can be outlined straight away
  if (S.tool === 'roi') { S.pts = []; addRoi({poly: pts}); hint(); redraw(); return; }
  S.pts = [];
  paint(pts, mode() === 'add');
  redraw();
}
// Adds the drawn area to a plant, or removes it from the plants, in the region that contains most of it.
function paint(pts, add){
  let best = null, most = 0, inside = null;
  for (const r of S.rois) {
    const m = polygonMask(pts, r.x0, r.y0, r.w, r.h);
    let c = 0; for (let i = 0; i < m.length; i++) if (m[i] && r.mask[i]) c++;
    if (c > most) { most = c; best = r; inside = m; }
  }
  if (!best) return message(TEXT.noPaint);
  if (!best.labels) best.labels = new Int32Array(best.w * best.h);
  snapshot(best);
  if (add) { const L = addArea(best.labels, best.mask, inside, best.next); if (L === best.next) best.next++; }
  else eraseArea(best.labels, inside);
  message('');
  remeasure(best);
}

/* ---------- Corrections ---------- */
const mode = () => document.querySelector('input[name=la-mode]:checked').value;
document.querySelectorAll('input[name=la-mode]').forEach(el => el.addEventListener('change', () => { S.pts = []; S.pick = null; hint(); redraw(); }));
// choosing a correction (even the one already chosen) ends drawing regions or lines, so clicks reach the plants
document.querySelectorAll('input[name=la-mode]').forEach(el => el.addEventListener('click', () => { if (S.tool) setTool(S.tool); }));
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
const busy = () => !!(S.tool || S.pts.length || (S.pick && mode() === 'merge'));
function cancelAction(){
  // Esc drops the points being placed; with none, it ends the tool (the region tool stays on between regions)
  const placing = S.pts.length > 0;
  S.pts = [];
  if (S.pick && mode() === 'merge') S.pick = null;
  if (S.tool && !placing) setTool(S.tool); else { hint(); redraw(); }
  message('');
}

const inPolygon = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    if ((ay <= y) !== (by <= y) && x < ax + (y - ay) / (by - ay) * (bx - ax)) inside = !inside;
  }
  return inside;
};
// The plant under a point: one of its pixels, or else the smallest convex hull around the point (so a
// click between the leaves of a rosette still finds it).
function plantAt(ix, iy){
  const order = [S.sel, ...S.rois.map((_, i) => i).reverse().filter(i => i !== S.sel)];
  for (const i of order) {
    const r = S.rois[i];
    if (!r?.labels) continue;
    const x = Math.floor(ix - r.x0), y = Math.floor(iy - r.y0);
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
    const L = r.labels[y * r.w + x];
    if (L) return {i, roi: r, label: L};
  }
  let best = null;
  S.rois.forEach((r, i) => r.plants.forEach(p => {
    if (p.hull.length >= 3 && inPolygon(ix, iy, p.hull) && (!best || p.hullArea < best.area)) best = {i, roi: r, label: p.label, area: p.hullArea};
  }));
  return best;
}
function click(ix, iy, sx, sy){
  if (!S.img) return;
  if (S.tool === 'scale') {
    S.pts.push([ix, iy]);
    if (S.pts.length === 2) finishLine();
    return redraw();
  }
  if (S.tool === 'circle') {
    S.pts.push([ix, iy]);
    if (S.pts.length === 2) {
      const [[cx, cy], [ex, ey]] = S.pts;
      S.pts = [];
      addRoi({circle: [cx, cy, Math.hypot(ex - cx, ey - cy)]});
      hint();
    }
    return redraw();
  }
  if (drawingPolygon()) {
    const p = S.tool === 'roi' ? [Math.max(0, Math.min(S.img.w, ix)), Math.max(0, Math.min(S.img.h, iy))] : [ix, iy];
    const [fx, fy] = S.pts.length ? toScreen(...S.pts[0]) : [Infinity, Infinity];
    if (S.pts.length >= 3 && Math.hypot(fx - sx, fy - sy) < 10) closePolygon(); else S.pts.push(p);
    return redraw();
  }
  const m = mode();
  if (m === 'split') {
    S.pts.push([ix, iy]);
    if (S.pts.length === 2) cut();
    return redraw();
  }
  const hit = plantAt(ix, iy);
  if (!hit) { S.pick = null; showInfo(); if (m !== 'info') message(TEXT.noPlant); return redraw(); }
  message('');
  if (hit.i !== S.sel) select(hit.i);
  const {roi, label: L} = hit, plant = roi.byLabel.get(L);
  if (m === 'info') { S.pick = {roi, label: L}; showInfo(roi, plant); return redraw(); }
  if (m === 'exclude') {
    snapshot(roi);
    if (plant.status === 'excluded') delete roi.manual[L]; else roi.manual[L] = 'excluded';
    return remeasure(roi);
  }
  if (m === 'merge') {
    if (!S.pick || S.pick.roi !== roi) { S.pick = {roi, label: L}; hint(TEXT.hints.mergeSecond); return redraw(); }
    if (S.pick.label === L) { S.pick = null; hint(); return redraw(); }
    snapshot(roi);
    // the joined plant keeps the smaller number
    const keep = Math.min(S.pick.label, L), gone = Math.max(S.pick.label, L);
    mergeCells(roi.labels, keep, gone);
    delete roi.manual[gone];
    S.pick = null; hint();
    remeasure(roi);
  }
}
// Divides the plant the line crosses (or whose convex hull holds the line's middle) along the line.
function cut(){
  const [[x1, y1], [x2, y2]] = S.pts;
  S.pts = [];
  let roi = null, L = 0;
  for (const r of S.rois) {
    if (!r.labels) continue;
    L = plantOnLine(r.labels, r.w, r.h, x1 - r.x0, y1 - r.y0, x2 - r.x0, y2 - r.y0);
    if (L) { roi = r; break; }
  }
  if (!roi) { const hit = plantAt((x1 + x2) / 2, (y1 + y2) / 2); if (hit) { roi = hit.roi; L = hit.label; } }
  if (!roi) { message(TEXT.noSplit); return; }
  const before = {labels: roi.labels.slice(), manual: {...roi.manual}, next: roi.next};
  const minPx = Math.max(10, (Number.isFinite(roi.params.minArea) ? roi.params.minArea : 0) / (S.scale * S.scale));
  if (!splitPlant(roi.labels, roi.w, roi.h, L, x1 - roi.x0, y1 - roi.y0, x2 - roi.x0, y2 - roi.y0, roi.next, minPx)) { message(TEXT.noSplit); return; }
  history.push({roi, ...before}); $('undo').disabled = false;
  roi.next++;
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
$('show-fill').addEventListener('change', renderAll);
['show-number', 'show-hull'].forEach(id => $(id).addEventListener('change', redraw));

/* ---------- Messages, info and results ---------- */
function message(text){ $('message').textContent = text || ''; }
function hint(text){
  $('hint').textContent = text ?? (S.img ? TEXT.hints[S.tool || mode()] : '');
}
function showInfo(roi, p){
  const box = $('info');
  if (!p) { box.hidden = true; return; }
  const items = [[TEXT.cols.plant, p.label], [TEXT.cols.status, TEXT.status[p.status]], ...MEASURES.map(m => [mLabel(m), fmt(p[m.key], m.d)])];
  box.innerHTML = `<p class="cs-info-head">${esc(roi.name)}</p><dl>` +
    items.map(([name, v]) => `<div><dt>${esc(name)}</dt><dd>${esc(v)}</dd></div>`).join('') + '</dl>';
  box.hidden = false;
}
const meanSd = (s, d) => Number.isFinite(s.mean) ? `${s.mean.toFixed(d)} ± ${Number.isFinite(s.sd) ? s.sd.toFixed(d) : '—'}` : '—';
const EMPTY_TABLE = $('table').innerHTML;
const summaries = () => S.rois.filter(r => r.labels).map(r => ({r, s: summarise(r.plants)}));
// The first columns of the region results; the measures follow (mean ± SD on screen; mean, SD and
// median in the CSV file and the copied table).
const regionBasics = ({r, s}) => [[TEXT.cols.region, r.id], [TEXT.cols.name, r.name], [TEXT.cols.count, s.count], [TEXT.cols.left, s.left], [TEXT.cols.total, s.total, 2]];
function refresh(){
  renderRoiList();
  hint();
  const rows = summaries();
  ['csv-plants', 'copy', 'png'].forEach(id => { $(id).disabled = !rows.length; });
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
// Region results as rows of cells for the CSV file and the copied table (same columns as the table on
// screen, with each measure split into mean, SD and median, followed by the settings used).
function regionRows(){
  const rows = summaries();
  const head = [TEXT.cols.image, ...regionBasics(rows[0]).map(c => c[0])];
  MEASURES.forEach(m => head.push(...['mean', 'sd', 'median'].map(k => `${mLabel(m)} ${TEXT.stat[k]}`)));
  head.push(TEXT.cols.pixel, TEXT.cols.threshold, TEXT.cols.auto, TEXT.cols.dark, TEXT.cols.gap, TEXT.cols.minArea, TEXT.cols.edge, TEXT.cols.white, TEXT.cols.version, TEXT.cols.date);
  const yn = v => v ? TEXT.yes : TEXT.no;
  return [head, ...rows.map(row => {
    const {r, s} = row, p = r.params;
    const out = [S.img.name, ...regionBasics(row).map(([, v, d]) => d == null ? v : csvNum(v, d))];
    MEASURES.forEach(m => out.push(...['mean', 'sd', 'median'].map(k => csvNum(s[m.key][k], m.d + 2))));
    out.push(fmtSig(S.scale), csvNum(p.threshold, 3), yn(p.auto), p.dark > 0 ? p.dark : TEXT.no, Number.isFinite(p.gap) ? p.gap : 0, Number.isFinite(p.minArea) ? p.minArea : 0, yn(p.excludeEdge), S.img.white.join(' '), VERSION, today());
    return out;
  })];
}

// The settings each plant was detected with, so that a saved file records how it was made.
const settingsHead = () => [TEXT.cols.pixel, TEXT.cols.threshold, TEXT.cols.auto, TEXT.cols.dark, TEXT.cols.gap, TEXT.cols.minArea, TEXT.cols.edge, TEXT.cols.white, TEXT.cols.version, TEXT.cols.date];
const settingsCols = (p, scale, white) => [fmtSig(scale), csvNum(p.threshold, 3), p.auto ? TEXT.yes : TEXT.no, p.dark > 0 ? p.dark : TEXT.no, Number.isFinite(p.gap) ? p.gap : 0, Number.isFinite(p.minArea) ? p.minArea : 0, p.excludeEdge ? TEXT.yes : TEXT.no, white.join(' '), VERSION, today()];
const plantHead = () => [TEXT.cols.region, TEXT.cols.name, TEXT.cols.plant, TEXT.cols.status, ...MEASURES.map(mLabel), TEXT.cols.x, TEXT.cols.y, ...settingsHead()];
const plantCols = (g, p, scale, white) => [g.id, g.name, p.label, TEXT.status[p.status], ...MEASURES.map(m => csvNum(p[m.key], m.d + 2)), csvNum(p.x, 2), csvNum(p.y, 2), ...settingsCols(g.params, scale, white)];
// Every plant, with the settings of its region (the region summary is in the copied results).
$('csv-plants').addEventListener('click', () => {
  const rows = [[TEXT.cols.image, ...plantHead()]];
  S.rois.forEach(r => r.plants.forEach(p => rows.push([S.img.name, ...plantCols(r, p, S.scale, S.img.white)])));
  download(new Blob([csv(rows)], {type: 'text/csv'}), `${baseName()}_plants.csv`);
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
  c.toBlob(b => download(b, `${baseName()}_plants.png`), 'image/png');
});


/* ---------- Batch: the same regions over a series of images ---------- */
// The scale, regions and detection settings of the open image are applied to every chosen image (a time
// series taken with a fixed camera). Plants are followed by position: each plant takes the number of the
// nearest plant seen so far (its latest position), so numbers stay the same through the series.
// Plants left out by hand stay left out; other corrections are not repeated.
const IMAGE_FILE = /\.(jpe?g|png|tiff?|webp)$/i;
const naturalCompare = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;
let batch = null;            // {entries, scale, view, opened, folder}
let stopBatch = false;
function batchMessage(text){ $('batch-message').textContent = text || ''; }
const localTime = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
// The date taken from EXIF, or else the file's modification time.
async function takenAt(file){
  try {
    let d = exifDate(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()));
    if (!d && /\.tiff?$/i.test(file.name)) d = exifDate(new Uint8Array(await file.arrayBuffer()));
    if (d) return {taken: d, exif: true};
  } catch {}
  return {taken: file.lastModified ? localTime(file.lastModified) : '', exif: false};
}
function cropRgba(rgba, W, r){
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) out.set(rgba.subarray(((y + r.y0) * W + r.x0) * 4, ((y + r.y0) * W + r.x0 + r.w) * 4), y * r.w * 4);
  return out;
}
// A reduced copy of the image with the plants drawn on it, for checking the results.
function thumbnail(im, regions){
  const f = Math.min(1, 1600 / im.w), c = document.createElement('canvas');
  c.width = Math.round(im.w * f); c.height = Math.round(im.h * f);
  const g = c.getContext('2d');
  g.drawImage(im.canvas, 0, 0, c.width, c.height);
  for (const r of regions) { renderOverlay(r); if (r.overlay) g.drawImage(r.overlay, r.x0 * f, r.y0 * f, r.w * f, r.h * f); r.overlay = null; }
  // labels at the size they have on screen, where the image is shown about 980 px wide
  drawVectors(g, (x, y) => [x * f, y * f], Math.max(1, c.width / 980), 0, 0, regions);
  return new Promise(res => c.toBlob(b => res(URL.createObjectURL(b)), 'image/jpeg', 0.85));
}
// Keeps what the results need and drops the pixel data.
function slim(g){ delete g.labels; delete g.overlay; g.plants.forEach(q => { delete q.outlines; }); return g; }

// The images of the folder chosen in step 1, in the order taken when every image has an EXIF date,
// otherwise by file name (1, 2, …, 10).
let series = null;           // {items: [{file, taken, exif}], folder}
async function orderImages(list){
  const items = [];
  for (const file of [...list].filter(f => IMAGE_FILE.test(f.name))) items.push({file, ...(await takenAt(file))});
  const byDate = items.every(x => x.exif);
  return items.sort((a, b) => (byDate && a.taken !== b.taken ? (a.taken < b.taken ? -1 : 1) : 0) || naturalCompare(a.file.name, b.file.name));
}
// A folder is chosen: its first image opens for setting up, and step 6 analyses them all.
$('folder').webkitdirectory = true;   // not in the HTML types, so set here
$('folder').addEventListener('change', async e => {
  const list = [...e.target.files];
  e.target.value = '';
  if (!list.length) return;
  message(TEXT.loading);
  const items = await orderImages(list);
  if (!items.length) return message(TEXT.batch.noImages);
  const folder = list[0].webkitRelativePath?.split('/')[0] || items[0].file.name.replace(/\.[^.]+$/, '');
  series = {items, folder};
  $('batch-run').textContent = TEXT.batch.run(items.length);
  $('batch-run').disabled = false;
  batchMessage('');
  await loadFile(items[0].file);
  $('image-info').textContent += TEXT.batch.folderInfo(folder, items.length);
  message([$('message').textContent, TEXT.batch.folderLoaded(items.length)].filter(Boolean).join('\n'));
});
async function runBatch(){
  if (!series) return;
  if (!S.img || !(S.scale > 0) || !S.rois.length) return batchMessage(TEXT.batch.needSetup);
  const {items, folder} = series;
  const W = S.img.w, H = S.img.h, scale = S.scale;
  const base = S.rois.map(r => ({
    id: r.id, name: r.name, shape: r.shape, poly: r.poly, labelAt: r.labelAt, x0: r.x0, y0: r.y0, w: r.w, h: r.h, mask: r.mask, params: {...r.params},
    excluded: Object.fromEntries(r.plants.filter(p => p.status === 'excluded').map(p => [p.label, 'excluded'])),
    // positions are in mm, so plants are followed across images of different sizes too
    track: new Map(r.plants.map(p => [p.label, {label: p.label, x: p.x, y: p.y, diameter: p.diameter}])),
  }));
  // images of another size with the same proportions (the same photographs saved larger or smaller) get
  // the regions and the pixel size scaled to them
  const setups = new Map([[`${W}x${H}`, {regions: base, scale}]]);
  const setupFor = (w, h) => {
    const key = `${w}x${h}`;
    if (!setups.has(key)) {
      const f = sizeFactor(w, h, W, H);
      setups.set(key, !f ? null : {scale: scale / f, regions: base.map(r => { const geo = scaledGeometry(r, f, w, h); return geo && {...r, ...geo}; }).filter(Boolean)});
    }
    return setups.get(key);
  };
  if (batch) batch.entries.forEach(e => { if (e.thumb) URL.revokeObjectURL(e.thumb); });
  batch = {entries: [], scale, view: 0, opened: -1, folder};
  stopBatch = false;
  $('batch-stop').hidden = false;
  ['folder', 'batch-run'].forEach(id => { $(id).disabled = true; });
  for (let k = 0; k < items.length && !stopBatch; k++) {
    const {file, taken, exif} = items[k];
    batchMessage(TEXT.batch.progress(k + 1, items.length, file.name));
    await new Promise(r => setTimeout(r, 0));
    const entry = {file, name: file.name, taken, exif, regions: [], note: ''};
    batch.entries.push(entry);
    let im;
    try { im = await readImage(file); } catch (err) { entry.note = `${TEXT.batch.unreadable}（${err.message}）`; continue; }
    const setup = setupFor(im.w, im.h);
    if (!setup) { entry.note = TEXT.batch.otherSize(im.w, im.h, W, H); continue; }
    const scale = entry.scale = setup.scale, s2 = scale * scale;
    if (scale !== batch.scale) entry.note = TEXT.batch.resized(im.w, im.h);
    const white = entry.white = whiteReference(im.rgba, im.w, im.h);
    for (const r of setup.regions) {
      const crop = cropRgba(im.rgba, im.w, r), index = greenIndex(crop, r.w, r.h, white);
      const p = {...r.params, autoValue: autoThreshold(index, r.mask)};
      if (p.auto) p.threshold = Math.round(p.autoValue * 100) / 100;
      const bright = p.dark > 0 ? brightness(crop, r.w, r.h, white) : null;
      const {labels} = detectPlants(index, r.mask, r.w, r.h, {threshold: p.threshold, minPx: (Number.isFinite(p.minArea) ? p.minArea : 0) / s2, gapPx: (Number.isFinite(p.gap) ? p.gap : 0) / scale, bright, darkLevel: p.dark});
      const plants = measurePlants(labels, r.mask, r.w, r.h, {scale, x0: r.x0, y0: r.y0});
      const old = [...r.track.values()];
      const map = matchPlants(old, plants, Math.max(1, ...old.map(q => q.diameter)));
      for (let i = 0; i < labels.length; i++) if (labels[i]) labels[i] = map.get(labels[i]);
      plants.forEach(q => { q.label = map.get(q.label); });
      plants.sort((a, b) => a.label - b.label);
      classify(plants, {excludeEdge: p.excludeEdge}, r.excluded);
      plants.forEach(q => r.track.set(q.label, {label: q.label, x: q.x, y: q.y, diameter: q.diameter}));
      entry.regions.push({id: r.id, name: r.name, poly: r.poly, labelAt: r.labelAt, x0: r.x0, y0: r.y0, w: r.w, h: r.h, params: p, plants, labels});
    }
    entry.thumb = await thumbnail(im, entry.regions);
    entry.regions.forEach(slim);
    if (k === 0 || batch.view === k - 1) batch.view = k;   // follow the progress unless the user looks elsewhere
    showBatch();
  }
  const skipped = batch.entries.filter(e => !e.regions.length).length;
  const reasons = [...new Set(batch.entries.filter(e => !e.regions.length).map(e => e.note))];
  batchMessage((stopBatch ? TEXT.batch.cancelled(batch.entries.length) : TEXT.batch.done(batch.entries.length - skipped, skipped)) + (reasons.length ? '\n' + reasons.join('\n') : ''));
  $('batch-stop').hidden = true;
  ['folder', 'batch-run'].forEach(id => { $(id).disabled = false; });
  showBatch();
}
$('batch-run').addEventListener('click', runBatch);
$('batch-stop').addEventListener('click', () => { stopBatch = true; });

// Hours since the earliest image.
function elapsed(entry){
  const first = batch.entries.map(e => e.taken).filter(Boolean).sort()[0];
  const h = hoursBetween(first, entry.taken);
  return Number.isFinite(h) ? Math.round(h * 100) / 100 : '';
}
// Results on screen: one row per image, with the mean area ± SD (number of plants) of each region.
function showBatch(){
  const box = $('batch');
  if (!batch?.entries.length) { box.hidden = true; return; }
  box.hidden = false;
  const n = batch.entries.length, e = batch.entries[Math.min(batch.view, n - 1)];
  const slider = $('batch-slider');
  slider.max = n - 1; slider.value = batch.view;
  $('batch-caption').textContent = TEXT.batch.view(batch.view + 1, n, e.name, e.taken) + (e.note ? `　${e.note}` : '');
  const img = $('batch-img');
  if (e.thumb) { img.src = e.thumb; img.hidden = false; } else img.hidden = true;
  $('batch-update').disabled = batch.opened !== batch.view || !S.img;
  const names = [];
  batch.entries.forEach(x => x.regions.forEach(g => { if (!names.some(m => m.id === g.id)) names.push({id: g.id, name: g.name}); }));
  const area = MEASURES[0];
  $('batch-table').innerHTML = `<table><thead><tr><th scope="col">${esc(TEXT.cols.image)}</th><th scope="col">${esc(TEXT.cols.taken)}</th><th scope="col">${esc(TEXT.cols.hours)}</th>` +
    names.map(m => `<th scope="col">${esc(`${m.name}: ${mLabel(area)}`)}</th>`).join('') + `<th scope="col" class="cs-left">${esc(TEXT.cols.note)}</th></tr></thead><tbody>` +
    batch.entries.map((x, i) => `<tr data-i="${i}" class="${i === batch.view ? 'is-selected' : ''}"><th scope="row">${esc(x.name)}</th><td>${esc(x.taken)}</td><td>${elapsed(x)}</td>` +
      names.map(m => { const g = x.regions.find(q => q.id === m.id); if (!g) return '<td>—</td>'; const s = summarise(g.plants); return `<td>${meanSd(s.area, area.d)} (${s.count})</td>`; }).join('') +
      `<td class="cs-left">${esc(x.note)}</td></tr>`).join('') + '</tbody></table>';
  ['batch-csv-plants', 'batch-csv-table', 'batch-copy'].forEach(id => { $(id).disabled = false; });
  drawGrowth();
}
$('batch-slider').addEventListener('input', e => { batch.view = +e.target.value; showBatch(); });
$('batch-table').addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) { batch.view = +tr.dataset.i; showBatch(); } });
$('batch-open').addEventListener('click', async () => {
  const e = batch?.entries[batch.view];
  if (!e) return;
  await loadFile(e.file, null, e);
  batch.opened = batch.view; showBatch();
  $('viewer').scrollIntoView({block: 'nearest'});
});
// The corrections made on the opened image replace its row in the batch results.
$('batch-update').addEventListener('click', async () => {
  const e = batch?.entries[batch.opened];
  if (!e || !S.img || S.img.name !== e.name) return;
  e.regions = S.rois.filter(r => r.labels).map(r => ({id: r.id, name: r.name, poly: r.poly, labelAt: r.labelAt, x0: r.x0, y0: r.y0, w: r.w, h: r.h, params: {...r.params}, plants: r.plants.map(p => ({...p})), labels: r.labels}));
  e.white = S.img.white; e.scale = S.scale; e.note = TEXT.batch.edited;
  if (e.thumb) URL.revokeObjectURL(e.thumb);
  e.thumb = await thumbnail(S.img, e.regions);
  e.regions.forEach(slim);
  batch.view = batch.opened; showBatch();
});

/* ---------- Growth chart ---------- */
// The chosen measure against the time taken: the mean ± SD of the measured plants of each region, or one
// line per plant (plants keep their numbers through the series). Only measured plants count, as in the tables.
MEASURES.forEach(m => { const o = document.createElement('option'); o.value = m.key; o.textContent = mLabel(m); $('growth-measure').append(o); });
const CHART = {W: 760, H: 440, ml: 74, mt: 20, mb: 62};
const CHART_INK = '#171717', CHART_MUTED = '#626262', CHART_LINE = '#E6E6E3';
let growth = null;           // the data drawn last, for clicks and saving
const measureCtx = document.createElement('canvas').getContext('2d');
const textWidth = text => { measureCtx.font = `13px ${FONT}`; return measureCtx.measureText(text).width; };
function niceTicks(min, max, count = 6){
  const span = max - min;
  if (!(span > 0)) return [min];
  const step0 = span / count, mag = 10 ** Math.floor(Math.log10(step0)), e = step0 / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}
function growthData(){
  const m = MEASURES.find(q => q.key === $('growth-measure').value) || MEASURES[0];
  const mode = $('growth-mode').value, select = $('growth-x');
  // without a date for every image, only the image order can be used
  const dated = batch.entries.every(e => e.taken);
  [...select.options].forEach(o => { o.disabled = !dated && o.value !== 'n'; });
  if (!dated) select.value = 'n';
  const xMode = select.value;
  const first = batch.entries.map(e => e.taken).filter(Boolean).sort()[0];
  const xs = batch.entries.map((e, i) => xMode === 'n' ? i + 1 : hoursBetween(first, e.taken) / (xMode === 'd' ? 24 : 1));
  const series = new Map();
  const line = (key, g, label) => {
    if (!series.has(key)) series.set(key, {id: g.id, name: g.name, label, color: ROI_COLORS[(g.id - 1) % ROI_COLORS.length], points: []});
    return series.get(key);
  };
  batch.entries.forEach((e, i) => {
    if (!Number.isFinite(xs[i])) return;
    e.regions.forEach(g => {
      if (mode === 'mean') {
        const s = summarise(g.plants)[m.key];
        if (Number.isFinite(s?.mean)) line(`${g.id}`, g, null).points.push({x: xs[i], y: s.mean, sd: s.sd, i});
      } else g.plants.forEach(p => { if (p.status === 'ok' && Number.isFinite(p[m.key])) line(`${g.id}-${p.label}`, g, p.label).points.push({x: xs[i], y: p[m.key], i}); });
    });
  });
  const list = [...series.values()].sort((a, b) => a.id - b.id || a.label - b.label);
  list.forEach(s => s.points.sort((a, b) => a.x - b.x));
  return {m, mode, xMode, xs, series: list, fileTimes: batch.entries.filter(e => e.taken && !e.exif).length, dated};
}
// marker: index of the image to mark with a dashed line (on screen only).
function growthSVG(d, marker = -1){
  const {W, H, ml, mt, mb} = CHART, mr = d.mode === 'plants' ? 48 : 24, pw = W - ml - mr, ph = H - mt - mb;
  const valid = d.xs.filter(Number.isFinite), pts = d.series.flatMap(s => s.points);
  let x0 = Math.min(...valid), x1 = Math.max(...valid);
  if (!(x1 > x0)) { x0 -= 1; x1 += 1; }
  const xp = (x1 - x0) * 0.04; x0 -= xp; x1 += xp;
  const top = Math.max(...pts.map(p => p.y + (Number.isFinite(p.sd) ? p.sd : 0)));
  // room above the highest point for the legend (one line per region) in the top left
  const nRegions = new Set(d.series.map(r => r.id)).size, room = nRegions * 20 + 26;
  const y0 = 0, y1 = top > 0 ? top * Math.max(1.06, ph / (ph - room)) : 1;
  const X = v => ml + (v - x0) / (x1 - x0) * pw, Y = v => mt + (1 - (v - y0) / (y1 - y0)) * ph;
  const f = v => v.toFixed(2);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="${esc(mName(d.m))}">`;
  s += `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
  const tick = 5;
  niceTicks(x0, x1).filter(v => d.xMode !== 'n' || Number.isInteger(v)).forEach(v => {
    s += `<line x1="${f(X(v))}" x2="${f(X(v))}" y1="${mt + ph - tick}" y2="${mt + ph}" stroke="${CHART_INK}" stroke-width="1.2"/>`;
    s += `<text x="${f(X(v))}" y="${mt + ph + 20}" font-size="13" fill="${CHART_INK}" text-anchor="middle">${v}</text>`;
  });
  niceTicks(y0, y1).forEach(v => {
    s += `<line x1="${ml}" x2="${ml + tick}" y1="${f(Y(v))}" y2="${f(Y(v))}" stroke="${CHART_INK}" stroke-width="1.2"/>`;
    s += `<text x="${ml - 8}" y="${f(Y(v) + 4)}" font-size="13" fill="${CHART_INK}" text-anchor="end">${v}</text>`;
  });
  if (marker >= 0 && Number.isFinite(d.xs[marker])) s += `<line x1="${f(X(d.xs[marker]))}" x2="${f(X(d.xs[marker]))}" y1="${mt}" y2="${mt + ph}" stroke="${CHART_MUTED}" stroke-width="1" stroke-dasharray="5 4"/>`;
  const plants = d.mode === 'plants';
  d.series.forEach(r => {
    const path = r.points.map((p, k) => `${k ? 'L' : 'M'}${f(X(p.x))} ${f(Y(p.y))}`).join('');
    s += `<path d="${path}" fill="none" stroke="${r.color}" stroke-width="${plants ? 1.4 : 2}" stroke-linejoin="round"/>`;
    r.points.forEach(p => {
      if (Number.isFinite(p.sd) && p.sd > 0) {
        const cx = f(X(p.x)), a = f(Y(p.y - p.sd)), b = f(Y(p.y + p.sd));
        s += `<path d="M${cx} ${a}V${b}M${f(X(p.x) - 4)} ${a}h8M${f(X(p.x) - 4)} ${b}h8" stroke="${r.color}" stroke-width="1.2" fill="none"/>`;
      }
      s += `<circle cx="${f(X(p.x))}" cy="${f(Y(p.y))}" r="${plants ? 2.5 : 4}" fill="${r.color}" stroke="#FFFFFF" stroke-width="${plants ? 0.6 : 1}"/>`;
    });
  });
  // plant numbers at the end of their lines, with a white halo
  // (moved apart vertically where they would overlap)
  if (plants) {
    const ends = d.series.filter(r => r.points.length).map(r => { const p = r.points[r.points.length - 1]; return {r, x: X(p.x) + 5, y: Y(p.y) + 4}; });
    ends.sort((a, b) => a.y - b.y).forEach((l, k) => { if (k && l.y < ends[k - 1].y + 12) l.y = ends[k - 1].y + 12; });
    ends.forEach(l => { s += `<text x="${f(l.x)}" y="${f(l.y)}" font-size="11" fill="${l.r.color}" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${l.r.label}</text>`; });
  }
  s += `<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="none" stroke="${CHART_INK}" stroke-width="1.2"/>`;
  // legend: one entry per region, in the top left (growth curves rise to the right)
  const regions = [];
  d.series.forEach(r => { if (!regions.some(g => g.id === r.id)) regions.push(r); });
  if (regions.length) {
    const lw = Math.ceil(Math.max(...regions.map(r => textWidth(r.name)))) + 52, lx = ml + 8, ly = mt + 8;
    s += `<rect x="${lx}" y="${ly}" width="${lw}" height="${regions.length * 20 + 10}" fill="#FFFFFF" fill-opacity="0.9" stroke="${CHART_LINE}"/>`;
    regions.forEach((r, k) => {
      const yy = ly + 18 + k * 20;
      s += `<line x1="${lx + 10}" x2="${lx + 32}" y1="${yy - 4}" y2="${yy - 4}" stroke="${r.color}" stroke-width="2"/><circle cx="${lx + 21}" cy="${yy - 4}" r="3.5" fill="${r.color}"/>`;
      s += `<text x="${lx + 40}" y="${yy}" font-size="13" fill="${CHART_INK}">${esc(r.name)}</text>`;
    });
  }
  const yl = d.mode === 'mean' ? `${mLabel(d.m)}${en ? ', mean ± SD' : '：平均 ± 標準偏差'}` : mLabel(d.m);
  s += `<text x="${ml + pw / 2}" y="${H - 14}" font-size="15" fill="${CHART_INK}" text-anchor="middle">${esc(TEXT.growth.x[d.xMode])}</text>`;
  s += `<text transform="translate(20 ${mt + ph / 2}) rotate(-90)" font-size="15" fill="${CHART_INK}" text-anchor="middle">${esc(yl)}</text>`;
  growth = {...d, X, x0, x1};
  return s + '</svg>';
}
function drawGrowth(){
  if (!batch?.entries.length) return;
  const d = growthData(), has = d.series.some(r => r.points.length);
  $('growth').innerHTML = has ? growthSVG(d, batch.view) : `<p class="tool-empty">${esc(TEXT.growth.empty)}</p>`;
  if (!has) growth = null;
  ['growth-png', 'growth-svg'].forEach(id => { $(id).disabled = !has; });
  $('growth-note').textContent = [!d.dated ? TEXT.growth.noTimes : d.fileTimes ? TEXT.growth.fileTimes(d.fileTimes) : '', has ? TEXT.growth.hint : ''].filter(Boolean).join(' ');
}
['growth-measure', 'growth-mode', 'growth-x'].forEach(id => $(id).addEventListener('change', drawGrowth));
// a click shows the image taken nearest to that time
$('growth').addEventListener('click', e => {
  const svg = $('growth').querySelector('svg');
  if (!svg || !growth) return;
  const box = svg.getBoundingClientRect(), px = (e.clientX - box.left) * CHART.W / box.width;
  let best = -1;
  growth.xs.forEach((x, i) => { if (Number.isFinite(x) && (best < 0 || Math.abs(growth.X(x) - px) < Math.abs(growth.X(growth.xs[best]) - px))) best = i; });
  if (best >= 0 && best !== batch.view) { batch.view = best; showBatch(); }
});
const growthFile = ext => `${batch.folder}_${growth.m.key}${growth.mode === 'plants' ? '_plants' : ''}.${ext}`;
const growthBlob = () => new Blob([growthSVG(growthData())], {type: 'image/svg+xml;charset=utf-8'});
$('growth-svg').addEventListener('click', () => { if (growth) download(growthBlob(), growthFile('svg')); });
$('growth-png').addEventListener('click', () => {
  if (!growth) return;
  const url = URL.createObjectURL(growthBlob()), img = new Image();
  img.onload = () => {
    const sc = 3, c = document.createElement('canvas');
    c.width = CHART.W * sc; c.height = CHART.H * sc;
    const g = c.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    c.toBlob(b => download(b, growthFile('png')), 'image/png');
  };
  img.src = url;
});

const batchHead = () => [TEXT.cols.image, TEXT.cols.taken, TEXT.cols.hours];
const batchStart = e => [e.name, e.taken, elapsed(e)];
const batchName = suffix => `${batch.folder}_${suffix}.csv`;
// Every plant in every image (long format).
$('batch-csv-plants').addEventListener('click', () => {
  const rows = [[...batchHead(), ...plantHead()]];
  batch.entries.forEach(e => e.regions.forEach(g => g.plants.forEach(p => rows.push([...batchStart(e), ...plantCols(g, p, e.scale ?? batch.scale, e.white)]))));
  download(new Blob([csv(rows)], {type: 'text/csv'}), batchName('plants'));
});
// The area of each plant: one row per image, one column per plant (for growth curves).
$('batch-csv-table').addEventListener('click', () => {
  const keys = [];
  batch.entries.forEach(e => e.regions.forEach(g => g.plants.forEach(p => { if (!keys.some(k => k.id === g.id && k.label === p.label)) keys.push({id: g.id, name: g.name, label: p.label}); })));
  keys.sort((a, b) => a.id - b.id || a.label - b.label);
  const rows = [[...batchHead(), ...keys.map(k => `${k.name} #${k.label} ${mLabel(MEASURES[0])}`)]];
  batch.entries.forEach(e => rows.push([...batchStart(e), ...keys.map(k => { const p = e.regions.find(g => g.id === k.id)?.plants.find(q => q.label === k.label); return p && p.status === 'ok' ? csvNum(p.area, 4) : ''; })]));
  download(new Blob([csv(rows)], {type: 'text/csv'}), batchName('area'));
});
// One row per image and region, as the region results of a single image, with the settings used.
function batchRegionRows(){
  const head = [...batchHead()];
  head.push(TEXT.cols.region, TEXT.cols.name, TEXT.cols.count, TEXT.cols.left, TEXT.cols.total);
  MEASURES.forEach(m => head.push(...['mean', 'sd', 'median'].map(k => `${mLabel(m)} ${TEXT.stat[k]}`)));
  head.push(TEXT.cols.pixel, TEXT.cols.threshold, TEXT.cols.auto, TEXT.cols.dark, TEXT.cols.gap, TEXT.cols.minArea, TEXT.cols.edge, TEXT.cols.white, TEXT.cols.note, TEXT.cols.version, TEXT.cols.date);
  const yn = v => v ? TEXT.yes : TEXT.no, rows = [head];
  for (const e of batch.entries) {
    if (!e.regions.length) { rows.push([...batchStart(e), ...Array(head.length - 6).fill(''), e.note, VERSION, today()]); continue; }
    for (const g of e.regions) {
      const s = summarise(g.plants), p = g.params, out = [...batchStart(e), g.id, g.name, s.count, s.left, csvNum(s.total, 4)];
      MEASURES.forEach(m => out.push(...['mean', 'sd', 'median'].map(k => csvNum(s[m.key][k], m.d + 2))));
      out.push(fmtSig(e.scale ?? batch.scale), csvNum(p.threshold, 3), yn(p.auto), p.dark > 0 ? p.dark : TEXT.no, Number.isFinite(p.gap) ? p.gap : 0, Number.isFinite(p.minArea) ? p.minArea : 0, yn(p.excludeEdge), e.white.join(' '), e.note, VERSION, today());
      rows.push(out);
    }
  }
  return rows;
}
$('batch-copy').addEventListener('click', e => {
  const lines = batchRegionRows().map(r => r.join('\t'));
  lines.push('', TEXT.batch.footer(VERSION, root.dataset.url, today(), batch.entries.length, batch.scale));
  copyText(lines.join('\n'), e.currentTarget);
});

document.querySelectorAll('[data-today]').forEach(el => { el.textContent = today(); });
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => {
  copyText(document.getElementById(button.dataset.copy).textContent.trim(), button);
}));
showThreshold(params());
showDark();
hint();
