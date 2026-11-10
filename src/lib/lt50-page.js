// Browser side of the LT50 tool page: reads the form, draws the chart and table, saves and copies results.
// All maths lives in lt50.js. The page language comes from <html lang>.
import {analyse, model} from './lt50.js';

const root = document.getElementById('lt50');
const en = document.documentElement.lang === 'en';
const $ = id => document.getElementById('lt50-' + id);

const TEXT = en ? {
  unnamed: 'Data', degree: '°C',
  empty: 'Paste data to see the fitted curves here.',
  noNumbers: 'No numeric data found. Put temperatures in the first column and values in the following columns.',
  skippedLong: n => `Skipped ${n} non-numeric rows (please check if any are not headings).`,
  skippedWide: n => `Skipped ${n} non-numeric rows within the data.`,
  format: (wide, groups, points) => `Read as ${wide ? 'wide layout (one column per replicate)' : 'long layout (one row per observation)'}: ${groups} group${groups === 1 ? '' : 's'}, ${points} points.`,
  errors: {
    'too-few': r => `Not enough data (at least 3 temperatures and ${r.need} points are needed).`,
    'no-fit': () => 'The curve could not be fitted.',
    'no-50': () => 'The fitted curve does not cross 50%. Choose “Midpoint of the curve” as the definition of LT50.',
  },
  outside: 'LT50 lies outside the measured temperatures (extrapolated, so less reliable).',
  failed: 'Could not be calculated',
  head: ['Group', 'LT50 (°C)', '95% CI', 'SE', 'Slope k', 'Lower', 'Upper', 'R²', 'n'],
  copyHead: ['Group', 'LT50 (°C)', '95% CI lower', '95% CI upper', 'SE', 'Slope k', 'Lower asymptote', 'Upper asymptote', 'R2', 'n'],
  copied: 'Copied',
  colorFor: g => `Colour of ${g}`,
  footer: (v, url, date) => `Calculated with LT50 Calculator version ${v} (${url}) on ${date}`,
} : {
  unnamed: 'データ', degree: '℃',
  empty: 'データを貼り付けると、ここに曲線が表示されます。',
  noNumbers: '数値のデータが見つかりません。1列目に温度、2列目以降に値を入れてください。',
  skippedLong: n => `数値でない行を${n}行読み飛ばしました（見出し行以外にもあれば確認してください）。`,
  skippedWide: n => `データの途中にある数値でない行を${n}行読み飛ばしました。`,
  format: (wide, groups, points) => `${wide ? '横長の形式（列ごとに反復）' : '縦長の形式（1行に1データ）'}として読み込みました：${groups}グループ、計${points}点`,
  errors: {
    'too-few': r => `データが足りません（温度は3水準以上、データは${r.need}点以上必要です）。`,
    'no-fit': () => '曲線を当てはめられませんでした。',
    'no-50': () => '曲線が50%を通らないため計算できません。LT50の定義を「曲線の中間点」にしてください。',
  },
  outside: 'LT50が測定した温度の範囲外です（外挿なので信頼性は低めです）。',
  failed: '計算できません',
  head: ['グループ', 'LT50 (℃)', '95%信頼区間', '標準誤差', '傾き k', '下限', '上限', 'R²', 'n'],
  copyHead: ['グループ', 'LT50(℃)', '95%CI下限', '95%CI上限', '標準誤差', '傾きk', '下限', '上限', 'R2', 'n'],
  copied: 'コピーしました',
  colorFor: g => `${g}の色`,
  footer: (v, url, date) => `LT50 計算ツール バージョン${v}（${url}）で${date}に計算`,
};

const SAMPLE = (en
  ? ['Genotype', 'Treatment', 'Temperature (°C)', 'Cold-acclimated', 'Non-acclimated']
  : ['Genotype', '処理', '温度 (℃)', '低温馴化', '無処理']
).reduce((s, v, i) => s.replaceAll(`{${i}}`, v), `{0}\tCol-0\t\t\t\tCol-0\t\t\tmutant1\t\t\t\t\tmutant1\t\t
{1}\t{3}\t\t\t\t{4}\t\t\t{3}\t\t\t\t\t{4}\t\t
{2}\trep1\trep2\trep3\trep4\trep1\trep2\trep3\trep1\trep2\trep3\trep4\trep5\trep1\trep2\trep3
-2\t\t\t\t\t100\t95\t80\t\t\t\t\t\t100\t100\t80
-3\t\t\t\t\t90\t95\t95\t\t\t\t\t\t\t\t
-4\t100\t95\t90\t100\t65\t75\t70\t80\t100\t95\t90\t100\t50\t65\t40
-5\t\t\t\t\t45\t60\t45\t\t\t\t\t\t\t\t
-6\t90\t85\t95\t100\t20\t30\t15\t80\t65\t75\t80\t\t10\t15\t25
-7\t\t\t\t\t5\t10\t5\t\t\t\t\t\t\t\t
-8\t75\t70\t80\t80\t0\t5\t15\t30\t40\t30\t40\t45\t5\t0\t0
-10\t40\t35\t40\t45\t\t\t\t0\t10\t5\t\t\t\t\t
-12\t0\t10\t0\t0\t\t\t\t0\t0\t0\t0\t\t\t\t
-14\t0\t0\t0\t5\t\t\t\t\t\t\t\t\t\t\t`);

// Site colours; series colours stay distinct, starting from the site's black.
const PALETTE = { bg: '#FFFFFF', ink: '#171717', muted: '#626262', grid: '#E6E6E3',
  colors: ['#171717', '#2B6684', '#B04A3A', '#5E8B2A', '#9A4A8C', '#B07D12', '#2E8C82', '#7A5C3A'] };
const defaultColor = i => i < PALETTE.colors.length ? PALETTE.colors[i] : `hsl(${Math.round((i * 137.5) % 360)}, 45%, 40%)`;
// Colours picked by the user, keyed by group name so they survive re-pasting the data.
// Remembered in this browser only; storage may be unavailable (private mode), which is fine.
let custom = {};
try { custom = JSON.parse(localStorage.getItem('lt50-colors') || '{}') || {}; } catch { custom = {}; }
const saveColors = () => { try { localStorage.setItem('lt50-colors', JSON.stringify(custom)); } catch {} };
const colorOf = (r, i) => custom[r.g || ''] || defaultColor(i);
// <input type=color> needs #rrggbb; generated hsl colours are converted.
function toHex(color){
  if (color.startsWith('#')) return color;
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = color;
  return c.fillStyle;
}
const FONT = 'Arial, Hiragino Kaku Gothic ProN, Yu Gothic, sans-serif';
const measure = document.createElement('canvas').getContext('2d');
const textWidth = text => { measure.font = `700 13px ${FONT}`; return measure.measureText(text).width; };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '—';
const label = g => g || TEXT.unnamed;
const SEP = en ? ': ' : '：';
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let last = null;

/* ---------- Chart ---------- */
function niceTicks(min, max, count = 6){
  const span = max - min;
  if (!(span > 0)) return [min];
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const e = step0 / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}
function buildSVG(res, xl, yl, showLT){
  const pal = PALETTE, ltLabels = [];
  const W = 760, H = 480, ml = 74, mr = 24, mt = 20, mb = 62;
  const pw = W - ml - mr, ph = H - mt - mb;
  const allx = res.flatMap(r => r.xs), ally = res.flatMap(r => r.ys);
  let x0 = Math.min(...allx), x1 = Math.max(...allx);
  const xp = (x1 - x0) * 0.05 || 1; x0 -= xp; x1 += xp;
  let y0 = Math.min(0, ...ally), y1 = Math.max(100, ...ally);
  const yp = (y1 - y0) * 0.04; y0 -= yp; y1 += yp;
  const X = v => ml + (v - x0) / (x1 - x0) * pw;
  const Y = v => mt + (1 - (v - y0) / (y1 - y0)) * ph;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="LT50">`;
  s += `<rect width="${W}" height="${H}" fill="${pal.bg}"/>`;
  // Outward ticks on the bottom and left axes; no grid lines. The black frame is drawn after the series.
  const tick = 5;
  niceTicks(x0, x1).forEach(v => {
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${mt + ph}" y2="${mt + ph + tick}" stroke="${pal.ink}" stroke-width="1.2"/>`;
    s += `<text x="${X(v)}" y="${mt + ph + tick + 16}" font-size="13" fill="${pal.ink}" text-anchor="middle">${v}</text>`;
  });
  niceTicks(y0, y1).forEach(v => {
    s += `<line x1="${ml - tick}" x2="${ml}" y1="${Y(v)}" y2="${Y(v)}" stroke="${pal.ink}" stroke-width="1.2"/>`;
    s += `<text x="${ml - tick - 5}" y="${Y(v) + 4}" font-size="13" fill="${pal.ink}" text-anchor="end">${v}</text>`;
  });
  if (50 > y0 && 50 < y1){
    s += `<line x1="${ml}" x2="${ml + pw}" y1="${Y(50)}" y2="${Y(50)}" stroke="${pal.muted}" stroke-width="1" stroke-dasharray="5 4"/>`;
  }
  res.forEach((r, i) => {
    const col = colorOf(r, i);
    if (r.p && !r.error){
      let d = '';
      for (let j = 0; j <= 240; j++){
        const xv = x0 + (x1 - x0) * j / 240;
        const yv = Math.max(y0, Math.min(y1, model(r.p, xv)));
        d += (j ? 'L' : 'M') + X(xv).toFixed(2) + ' ' + Y(yv).toFixed(2);
      }
      s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4"/>`;
    }
    r.xs.forEach((x, k) => {
      s += `<circle cx="${X(x)}" cy="${Y(r.ys[k])}" r="4.5" fill="${col}" fill-opacity="0.7" stroke="${pal.bg}" stroke-width="1"/>`;
    });
    // The dashed line and marker are always drawn; only the value labels follow the toggle.
    if (!r.error && Number.isFinite(r.lt) && r.lt > x0 && r.lt < x1){
      const yat = model(r.p, r.lt);
      s += `<line x1="${X(r.lt)}" x2="${X(r.lt)}" y1="${Y(yat)}" y2="${mt + ph}" stroke="${col}" stroke-width="1.3" stroke-dasharray="4 3"/>`;
      s += `<circle cx="${X(r.lt)}" cy="${Y(yat)}" r="5" fill="${pal.bg}" stroke="${col}" stroke-width="2"/>`;
      if (showLT) ltLabels.push({ x: X(r.lt), text: `LT50 ${r.lt.toFixed(1)}${TEXT.degree}`, col });
    }
  });
  // Frame after the series so curves and points never cover it.
  s += `<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="none" stroke="${pal.ink}" stroke-width="1.2"/>`;
  if (res.length > 1 || res[0].g){
    // Put the legend in the empty top corner: survival rises to the right, leakage rises to the left.
    const rising = res.filter(r => r.p && !r.error).reduce((n, r) => n + Math.sign(r.p[3] * (r.p[1] - r.p[0])), 0) >= 0;
    const lw = 190, lx = rising ? ml + 8 : ml + pw - lw - 8, ly = mt + 8;
    s += `<rect x="${lx}" y="${ly}" width="${lw}" height="${res.length * 20 + 10}" fill="${pal.bg}" fill-opacity="0.9" stroke="${pal.grid}"/>`;
    res.forEach((r, i) => {
      const col = colorOf(r, i), yy = ly + 18 + i * 20;
      s += `<line x1="${lx + 10}" x2="${lx + 32}" y1="${yy - 4}" y2="${yy - 4}" stroke="${col}" stroke-width="2.4"/>`;
      s += `<circle cx="${lx + 21}" cy="${yy - 4}" r="4" fill="${col}"/>`;
      s += `<text x="${lx + 40}" y="${yy}" font-size="13" fill="${pal.ink}">${esc(label(r.g))}</text>`;
    });
  }
  // LT50 labels go last so they sit above curves, points and the legend. Each label takes the lowest
  // row where it does not overlap a label already placed; a white halo keeps it legible over lines.
  const rows = [];
  ltLabels.sort((a, b) => a.x - b.x).forEach(l => {
    const w = textWidth(l.text), right = l.x + 6 + w > ml + pw;
    const left = right ? l.x - 6 - w : l.x + 6, end = left + w;
    let row = rows.findIndex(r => r.every(([a, b]) => end + 4 < a || left - 4 > b));
    if (row < 0){ rows.push([]); row = rows.length - 1; }
    rows[row].push([left, end]);
    s += `<text x="${right ? l.x - 6 : l.x + 6}" y="${mt + ph - 10 - row * 18}" font-size="13" font-weight="700" fill="${l.col}" text-anchor="${right ? 'end' : 'start'}" stroke="${pal.bg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${l.text}</text>`;
  });
  s += `<text x="${ml + pw / 2}" y="${H - 14}" font-size="15" fill="${pal.ink}" text-anchor="middle">${esc(xl)}</text>`;
  s += `<text transform="translate(20 ${mt + ph / 2}) rotate(-90)" font-size="15" fill="${pal.ink}" text-anchor="middle">${esc(yl)}</text>`;
  return s + '</svg>';
}

/* ---------- Run ---------- */
const checked = name => document.querySelector(`input[name=lt50-${name}]:checked`).value;
const outputs = ['png', 'svg', 'copy'];
function run(){
  const text = $('data').value;
  const mode = checked('mode'), def = checked('def');
  const { rows, skipped, format, results } = analyse(text, mode, def);
  const msgs = [];
  if (format === 'long' && skipped > 1) msgs.push(TEXT.skippedLong(skipped));
  if (format === 'wide' && skipped > 0) msgs.push(TEXT.skippedWide(skipped));
  if (!rows.length){
    last = null;
    $('chart').innerHTML = `<p class="tool-empty">${TEXT.empty}</p>`;
    $('table').innerHTML = '';
    $('colors').hidden = true;
    outputs.forEach(id => $(id).disabled = true);
    $('message').textContent = text.trim() ? TEXT.noNumbers : '';
    $('format').textContent = '';
    return;
  }
  results.forEach(r => {
    if (r.error) msgs.push(label(r.g) + SEP + TEXT.errors[r.error](r));
    else if (r.outside) msgs.push(label(r.g) + SEP + TEXT.outside);
  });
  last = { res: results, mode, xl: $('xlab').value, yl: $('ylab').value, showLT: $('show-lt').checked };
  drawChart();
  table();
  $('message').textContent = msgs.join('\n');
  $('format').textContent = TEXT.format(format === 'wide', results.length, rows.length);
  outputs.forEach(id => $(id).disabled = !results.some(r => !r.error));
}
function table(){
  const free = last.mode === 'free';
  const head = TEXT.head.filter((_, i) => free || (i !== 5 && i !== 6));
  let h = `<table><thead><tr>${head.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>`;
  last.res.forEach((r, i) => {
    const col = toHex(colorOf(r, i));
    const name = `<label class="tool-swatch"><input type="color" value="${col}" data-index="${i}" aria-label="${esc(TEXT.colorFor(label(r.g)))}"><span style="background:${col}"></span></label>${esc(label(r.g))}`;
    if (r.error){ h += `<tr><th scope="row">${name}</th><td colspan="${head.length - 1}" class="tool-failed">${TEXT.failed}</td></tr>`; return; }
    h += `<tr><th scope="row">${name}</th><td class="tool-lt">${fmt(r.lt)}</td><td>${fmt(r.lo)} – ${fmt(r.hi)}</td><td>${fmt(r.se)}</td><td>${fmt(r.p[3], 3)}</td>`;
    if (free) h += `<td>${fmt(r.p[0], 1)}</td><td>${fmt(r.p[1], 1)}</td>`;
    h += `<td>${fmt(r.r2, 3)}</td><td>${r.n}</td></tr>`;
  });
  $('table').innerHTML = h + '</tbody></table>';
  $('colors').hidden = false;
}
// Only the chart is redrawn while picking, so the open colour picker is not replaced.
$('table').addEventListener('input', e => {
  const input = e.target.closest('input[type=color]');
  if (!input || !last) return;
  const r = last.res[Number(input.dataset.index)];
  custom[r.g || ''] = input.value;
  input.nextElementSibling.style.background = input.value;
  saveColors();
  drawChart();
});
$('reset-colors').onclick = () => { custom = {}; saveColors(); if (last){ drawChart(); table(); } };
function drawChart(){ $('chart').innerHTML = buildSVG(last.res, last.xl, last.yl, last.showLT); }

/* ---------- Save and copy ---------- */
function download(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const svgBlob = () => new Blob([buildSVG(last.res, last.xl, last.yl, last.showLT)], { type: 'image/svg+xml;charset=utf-8' });
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
$('svg').onclick = () => download(svgBlob(), 'LT50.svg');
$('png').onclick = () => {
  const url = URL.createObjectURL(svgBlob());
  const img = new Image();
  img.onload = () => {
    const sc = 3, c = document.createElement('canvas');
    c.width = 760 * sc; c.height = 480 * sc;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    c.toBlob(b => download(b, 'LT50.png'), 'image/png');
  };
  img.src = url;
};
$('copy').onclick = () => {
  const lines = [TEXT.copyHead.join('\t')];
  last.res.forEach(r => {
    if (r.error){ lines.push(`${label(r.g)}\t${TEXT.failed}`); return; }
    lines.push([label(r.g), fmt(r.lt, 3), fmt(r.lo, 3), fmt(r.hi, 3), fmt(r.se, 3), fmt(r.p[3], 4), fmt(r.p[0], 2), fmt(r.p[1], 2), fmt(r.r2, 4), r.n].join('\t'));
  });
  lines.push('', TEXT.footer(root.dataset.version, root.dataset.url, today()));
  copyText(lines.join('\n'), $('copy'));
};

/* ---------- Citation ---------- */
document.querySelectorAll('[data-today]').forEach(el => { el.textContent = today(); });
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => {
  copyText(document.getElementById(button.dataset.copy).textContent.trim(), button);
}));

/* ---------- Controls ---------- */
let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
['data', 'xlab', 'ylab'].forEach(id => $(id).addEventListener('input', schedule));
document.querySelectorAll('input[name=lt50-mode]').forEach(el => el.addEventListener('change', () => {
  $('def').disabled = checked('mode') === 'fixed';
  run();
}));
document.querySelectorAll('input[name=lt50-def]').forEach(el => el.addEventListener('change', run));
$('show-lt').addEventListener('change', () => { if (last){ last.showLT = $('show-lt').checked; drawChart(); } });
$('run').onclick = run;
$('sample').onclick = () => { $('data').value = SAMPLE; run(); };
$('clear').onclick = () => { $('data').value = ''; run(); };
