import {VERSION as LT50_VERSION} from '../lib/lt50.js';
// Research tools published on the site. Each tool has its own page at tools/<slug>/ in both languages.
// version and updated also appear in the tool's citation, so change them together with the tool.
export interface Tool {
 slug:string; name:string; version:string; updated:string;
 title:{ja:string;en:string}; summary:{ja:string;en:string};
 history:{version:string;date:string;ja:string;en:string}[];
}
export const tools:Tool[] = [
 {
  slug:'lt50', name:'LT50 Calculator', version:LT50_VERSION, updated:'2026-11-10',
  title:{ja:'LT50 計算ツール（耐凍性）',en:'LT50 Calculator (freezing tolerance)'},
  summary:{
   ja:'Excelから温度と生存率（または電解質漏出率）を貼り付けるだけで、シグモイド曲線を当てはめてLT50と95%信頼区間を求め、グラフを描きます。',
   en:'Paste temperatures and survival (or electrolyte leakage) from a spreadsheet to fit a sigmoid curve, estimate LT50 with a 95% confidence interval and draw the graph.',
  },
  history:[
   {version:'1.1',date:'2026-11-10',ja:'グラフの表示を改善（系列ごとの色の選択、LT50の値の表示切り替え、黒枠と目盛り、温度軸の向きの選択）。計算方法は変更なし',en:'Improved graph display (per-series colours, toggle for LT50 values, framed axes with ticks, choice of temperature direction). Calculations unchanged'},
   {version:'1.0',date:'2026-11-10',ja:'公開',en:'First release'},
  ],
 },
];
export const toolUrlBase = 'https://www.adaptationbiology.com';
