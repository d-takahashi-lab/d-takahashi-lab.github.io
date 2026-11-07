import {principal as originalPrincipal,students as originalStudents,alumni as originalAlumni} from './members';
// Preferred names and research-topic wording checked against the original
// English Members page: https://www.adaptationbiology.com/en/members-1
export const principal={...originalPrincipal,name:'Daisuke TAKAHASHI',english:'',position:'Associate Professor',affiliation:'Graduate School of Science and Engineering / Department of Molecular Biology, Faculty of Science, Saitama University',interests:['Plant responses to environmental stress','cold acclimation and deacclimation','structure and function of cell walls and polysaccharides']};
const topics:Record<string,string>={
 'コムギフルクタンの代謝制御':'Metabolic regulation of wheat fructans',
 '低温馴化過程でのデンプンの構造変化':'Structural changes of starch during cold acclimation',
 '低温馴化・脱馴化での細胞壁の可塑性':'Cell wall plasticity during cold acclimation and deacclimation',
 'コムギクラウンの低温による組織形態変化':'Cold-induced morphological changes in wheat crown',
 'デンプンの糖鎖構造の日周変化':'Diurnal changes in starch glycan structure',
 '寒締めコマツナ成熟葉の細胞分裂解析':'Cold-induced cell division in mature leaves',
 'タンパク質言語モデルによる天然変性タンパク質の比較':'Comparing intrinsically disordered proteins with a protein language model',
};
const roles:Record<string,string>={'博士後期2年':'2nd-year PhD','博士前期2年':'2nd-year MSc','博士前期1年':'1st-year MSc','学部4年':'4th-year BSc','学部3年':'3rd-year BSc'};
export const names:Record<string,string>={
 '菊地 拓真':'Takuma KIKUCHI',
 '小林 美紅':'Miku KOBAYASHI',
 '納谷 美咲':'Misaki NAYA',
 '橘 慶汰':'Keita TACHIBANA',
 '星野 太希':'Taiki HOSHINO',
 '神津 龍也':'Tatsuya KOZU',
 '渡邊 愛織':'Eri WATANABE',
 '今関 拓麻':'Takuma IMAZEKI',
 '植田 亮':'Ryo UETA',
 '小杉 悠惺':'Yuse Kosugi',
 '泉 義紀':'Yoshiki Izumi',
 '大橋 桃花':'Momoka Ohashi',
 '菊地 由華':'Yuka Kikuchi',
 'Sushan Chowhan':'Sushan Chowhan',
 '久津野 達也':'Tatsuya Kutsuno',
 '佐々木 和馬':'Kazuma Sasaki',
 '柴崎 由季乃':'Yukino Shibasaki',
 '沼尾 悠太':'Yuta Numao',
 '西山 結衣':'Yui Nishiyama',
};
export const students=originalStudents.map(s=>({...s,name:names[s.name],role:roles[s.role],topic:topics[s.topic]||'',note:s.note?'JSPS DC1':''}));
const degrees:Record<string,string>={'修士':'MSc','博士':'PhD','学士':'BSc'};
export const alumni=originalAlumni.map(s=>({...s,name:names[s.name],degree:degrees[s.degree]}));
