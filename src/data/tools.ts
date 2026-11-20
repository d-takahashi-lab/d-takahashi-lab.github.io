import {VERSION as LT50_VERSION} from '../lib/lt50.js';
import {VERSION as CELLSHAPE_VERSION} from '../lib/cellshape.js';
// Research tools published on the site. Each tool has its own page at tools/<slug>/ in both languages.
// Tool names are in English on both the Japanese and English pages, and used as they are for titles.
// version and updated also appear in the tool's citation, so change them together with the tool.
export interface Tool {
 slug:string; name:string; version:string; updated:string;
 summary:{ja:string;en:string};
 history:{version:string;date:string;ja:string;en:string}[];
}
export const tools:Tool[] = [
 {
  slug:'lt50', name:'LT50 Calculator', version:LT50_VERSION, updated:'2026-11-10',
  summary:{
   ja:'Excelから温度と生存率（または電解質漏出率）を貼り付けるだけで、シグモイド曲線を当てはめてLT50と95%信頼区間を求め、グラフを描きます。',
   en:'Paste temperatures and survival (or electrolyte leakage) from a spreadsheet to fit a sigmoid curve, estimate LT50 with a 95% confidence interval and draw the graph.',
  },
  history:[
   {version:'1.1',date:'2026-11-10',ja:'グラフの表示を改善（系列ごとの色の選択、LT50の値の表示切り替え、黒枠と目盛り、温度軸の向きの選択）。計算方法は変更なし',en:'Improved graph display (per-series colours, toggle for LT50 values, framed axes with ticks, choice of temperature direction). Calculations unchanged'},
   {version:'1.0',date:'2026-11-10',ja:'公開',en:'First release'},
  ],
 },
 {
  slug:'cellshape', name:'Cell Shape Analyzer', version:CELLSHAPE_VERSION, updated:'2026-11-20',
  summary:{
   ja:'葉・茎・根の切片などの顕微鏡画像で表皮・柵状組織・皮層などの領域を囲むと、その中の細胞を色分けして数え、輪郭をトレースして面積・縦横比・円形度・表面との角度などを計算します。',
   en:'Outline a region such as the epidermis, palisade mesophyll or cortex in a microscope image of a section of a leaf, stem or root: the cells inside are coloured, counted and traced, and their area, aspect ratio, circularity, angle to the surface and other measures are calculated.',
  },
  history:[
   {version:'1.0',date:'2026-11-20',ja:'公開',en:'First release'},
  ],
 },
];
export const toolUrlBase = 'https://www.adaptationbiology.com';
