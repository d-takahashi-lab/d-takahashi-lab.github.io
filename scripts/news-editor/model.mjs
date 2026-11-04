const text=(v,max=50000)=>{if(typeof v!=='string'||v.length>max)throw Error('入力内容が長すぎるか、形式が正しくありません。');return v.trim();};
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
 article.image=text(input.image||'',300);
 if(article.image&&!/^images\/news\/[a-z0-9-]+\.(?:jpg|png|webp|gif)$/.test(article.image))throw Error('写真を選び直してください。');
 for(const field of ['imageAlt','imageAltEn','imageCaption','imageCaptionEn'])article[field]=text(input[field]||'',1000);
 if(article.status==='published'&&article.image&&!article.imageAlt)throw Error('写真の説明（代替テキスト）を入力してください。');
 if(article.status==='published'&&article.image&&english.title&&!article.imageAltEn)throw Error('英語版の写真説明も入力してください。');
 return article;
}
export function replaceArticle(records,article){
 const existing=records.findIndex(n=>n.id===article.id);
 if(records.some((n,i)=>i!==existing&&n.anchor===article.anchor))throw Error('同じページ内IDが使われています。');
 const result=[...records];if(existing<0)result.push(article);else result[existing]=article;
 return result.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
