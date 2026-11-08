const text=(v,max=50000)=>{if(typeof v!=='string'||v.length>max)throw Error('入力内容が長すぎるか、形式が正しくありません。');return v.trim();};
export const MAX_IMAGES=12;
// Older records and drafts hold one photo in flat fields (image, imageAlt…); read both shapes.
export const imagesOf=a=>Array.isArray(a?.images)?a.images:a?.image?[{src:a.image,alt:a.imageAlt||'',altEn:a.imageAltEn||'',caption:a.imageCaption||'',captionEn:a.imageCaptionEn||''}]:[];
export function withImages(a){const {image,imageAlt,imageAltEn,imageCaption,imageCaptionEn,...rest}=a;return {...rest,images:imagesOf(a)};}
export function validateArticle(input){
 if(!input||typeof input!=='object')throw Error('記事の形式が正しくありません。');
 const id=text(input.id,100);
 if(!/^[a-z0-9][a-z0-9-]*$/.test(id))throw Error('記事IDは半角英数字とハイフンで入力してください。');
 const date=text(input.date,10),parsed=new Date(date+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(+parsed)||parsed.toISOString().slice(0,10)!==date)throw Error('日付を確認してください。');
 if(!['draft','published'].includes(input.status)||!['LAB','EVENT','PAPER','AWARD'].includes(input.type))throw Error('掲載状態または種別を確認してください。');
 const article={id,date,status:input.status,type:input.type,anchor:text(input.anchor||'news-'+id,120)};
 if(!/^[a-zA-Z0-9-]+$/.test(article.anchor))throw Error('ページ内IDが正しくありません。');
 for(const lang of ['ja','en']){const v=input[lang]||{};article[lang]={title:text(v.title||'',200),summary:text(v.summary||'',600),body:text(v.body||'')};}
 if(!article.ja.title)throw Error('日本語のタイトルを入力してください。');
 if(article.status==='published'&&!article.ja.body)throw Error('掲載する記事には本文を入力してください。');
 const english=article.en;
 if(article.status==='published'&&Object.values(english).some(Boolean)&&(!english.title||!english.body))throw Error('英語版を掲載する場合は、英語タイトルと本文を入力してください。空欄なら日本語版だけに掲載します。');
 article.link=text(input.link||'',2000);
 if(article.link&&!/^(?:research|members|publications|contact|news)\/[a-zA-Z0-9/#?=._%-]*$/.test(article.link)){
  try{const u=new URL(article.link);if(u.protocol!=='https:')throw Error();}catch{throw Error('関連リンクはhttpsのURL、またはサイト内のパスを入力してください。');}
 }
 const source=imagesOf(input);
 if(source.length>MAX_IMAGES)throw Error('写真は1記事に'+MAX_IMAGES+'枚までです。');
 article.images=source.map(image=>{
  const value={src:text(image?.src||'',300)};
  if(!/^images\/news\/[a-z0-9-]+\.(?:jpg|png|webp|gif)$/.test(value.src))throw Error('写真を選び直してください。');
  for(const field of ['alt','altEn','caption','captionEn'])value[field]=text(image[field]||'',1000);
  if(article.status==='published'&&!value.alt)throw Error('写真の説明（代替テキスト）を入力してください。');
  if(article.status==='published'&&english.title&&!value.altEn)throw Error('英語版の写真説明も入力してください。');
  return value;
 });
 if(new Set(article.images.map(i=>i.src)).size!==article.images.length)throw Error('同じ写真が重複しています。');
 return article;
}
export function replaceArticle(records,article){
 const existing=records.findIndex(n=>n.id===article.id);
 if(records.some((n,i)=>i!==existing&&n.anchor===article.anchor))throw Error('同じページ内IDが使われています。');
 const result=[...records];if(existing<0)result.push(article);else result[existing]=article;
 return result.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
